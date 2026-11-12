import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POST as openaiPost } from "../app/v1/chat/completions/route.ts";
import { POST as customPost } from "../app/api/chat/route.ts";
import { GET as modelsGet } from "../app/v1/models/route.ts";
import { GET as healthGet } from "../app/api/health/route.ts";
import { checkRateLimit, _resetMemoryLimiter } from "../lib/rate-limit.ts";
import { loadConfig } from "../lib/env.ts";
import { json, mockFetch, post, setEnv, upstreamOk } from "./helpers.ts";

let m: ReturnType<typeof mockFetch>;
beforeEach(() => { setEnv(); _resetMemoryLimiter(); m = mockFetch(() => json(upstreamOk)); });
afterEach(() => m.restore());

const body = { model: "gemini-flash", messages: [{ role: "user", content: "Hello!" }] };

test("openai: success is branded; Respan key is sent upstream only", async () => {
  const res = await openaiPost(post("/v1/chat/completions", body));
  assert.equal(res.status, 200);
  const j: any = await res.json();
  assert.equal(j.choices[0].message.content, "Hello! How can I help?");
  assert.equal(j.rbx404.developer, "RBX404");
  assert.equal(res.headers.get("X-RBX404-Developer"), "RBX404");
  assert.ok(res.headers.get("X-RBX404-Request-ID"));
  assert.equal(m.calls[0].url, "https://gateway.respan.ai/v1/chat/completions");
  assert.equal((m.calls[0].init.headers as any).Authorization, "Bearer test-respan-secret");
  assert.ok(!JSON.stringify(j).includes("test-respan-secret"));
});

test("custom /api/chat: prompt format returns credits and real usage", async () => {
  const res = await customPost(post("/api/chat", { model: "gemini-flash", prompt: "Hello!", system: "Be brief" }));
  const j: any = await res.json();
  assert.equal(j.success, true);
  assert.equal(j.response, "Hello! How can I help?");
  assert.equal(j.usage.total_tokens, 17);
  assert.equal(j.credits.channel, "https://t.me/BlackoutZoneRBX404");
  const sent = JSON.parse(m.calls[0].init.body as string);
  assert.equal(sent.messages[0].role, "system");
});


test("custom model aliases are listed publicly and mapped upstream", async () => {
  setEnv({ RBX404_MODEL_MAP: JSON.stringify({ "rbx404-smart": "provider/model-secret-id", "rbx404-fast": "provider/fast-id" }), RBX404_ALLOWED_MODELS: undefined });
  const list = await modelsGet(new Request("http://x/v1/models", { headers: { Authorization: "Bearer client-key-1" } }));
  const listed: any = await list.json();
  assert.deepEqual(listed.data.map((x: any) => x.id), ["rbx404-smart", "rbx404-fast"]);

  const response = await openaiPost(post("/v1/chat/completions", { model: "rbx404-smart", messages: [{ role: "user", content: "hi" }] }));
  const result: any = await response.json();
  assert.equal(JSON.parse(m.calls[0].init.body as string).model, "provider/model-secret-id");
  assert.equal(result.model, "rbx404-smart");
  assert.ok(!JSON.stringify(result).includes("provider/model-secret-id"));
});

test("custom API returns the public alias, not the upstream model ID", async () => {
  setEnv({ RBX404_MODEL_MAP: JSON.stringify({ "rbx404-smart": "provider/model-secret-id" }), RBX404_ALLOWED_MODELS: undefined });
  const response = await customPost(post("/api/chat", { model: "rbx404-smart", prompt: "hello" }));
  const result: any = await response.json();
  assert.equal(JSON.parse(m.calls[0].init.body as string).model, "provider/model-secret-id");
  assert.equal(result.model, "rbx404-smart");
});

test("streaming SSE rewrites upstream model IDs to public aliases", async () => {
  setEnv({ RBX404_MODEL_MAP: JSON.stringify({ "rbx404-smart": "provider/model-secret-id" }), RBX404_ALLOWED_MODELS: undefined });
  m.restore();
  const sse = 'data: {"id":"1","model":"provider/model-secret-id","choices":[{"delta":{"content":"Hi"}}]}\\n\\ndata: [DONE]\\n\\n';
  m = mockFetch(() => new Response(sse, { headers: { "Content-Type": "text/event-stream" } }));
  const response = await openaiPost(post("/v1/chat/completions", { model: "rbx404-smart", stream: true, messages: [{ role: "user", content: "hi" }] }));
  const text = await response.text();
  assert.ok(text.includes('"model":"rbx404-smart"'));
  assert.ok(!text.includes("provider/model-secret-id"));
});

test("auth: missing and invalid keys are rejected without calling upstream", async () => {
  assert.equal((await openaiPost(post("/v1/chat/completions", body, null))).status, 401);
  assert.equal((await openaiPost(post("/v1/chat/completions", body, "wrong"))).status, 401);
  assert.equal(m.calls.length, 0);
});

test("unsupported model -> 400; oversized body -> 413; bad JSON -> 400", async () => {
  assert.equal((await openaiPost(post("/v1/chat/completions", { ...body, model: "nope" }))).status, 400);
  setEnv({ RBX404_MAX_BODY_BYTES: "50" });
  assert.equal((await openaiPost(post("/v1/chat/completions", body))).status, 413);
  setEnv();
  assert.equal((await openaiPost(post("/v1/chat/completions", "{oops"))).status, 400);
});

test("streaming: SSE passed through untouched, attribution in headers", async () => {
  m.restore();
  const sse = 'data: {"id":"1","choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n';
  m = mockFetch(() => new Response(sse, { headers: { "Content-Type": "text/event-stream" } }));
  const res = await openaiPost(post("/v1/chat/completions", { ...body, stream: true }));
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  assert.equal(res.headers.get("X-RBX404-Channel"), "https://t.me/BlackoutZoneRBX404");
  assert.equal(await res.text(), sse);
});

test("upstream errors: auth failure hidden, timeout 504, network 502", async () => {
  m.restore();
  m = mockFetch(() => json({ error: { message: "bad key sk-secret" } }, 401));
  let res = await openaiPost(post("/v1/chat/completions", body));
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes("sk-secret"));
  m.restore();
  m = mockFetch(() => Object.assign(new Error("t"), { name: "TimeoutError" }));
  assert.equal((await openaiPost(post("/v1/chat/completions", body))).status, 504);
  m.restore();
  m = mockFetch(() => new Error("ECONNRESET"));
  assert.equal((await customPost(post("/api/chat", { model: "gpt-test", prompt: "x" }))).status, 502);
});

test("models list uses configured allowlist; health is public", async () => {
  const res = await modelsGet(new Request("http://x/v1/models", { headers: { Authorization: "Bearer client-key-2" } }));
  const j: any = await res.json();
  assert.deepEqual(j.data.map((d: any) => d.id), ["gemini-flash", "gpt-test"]);
  assert.equal((await healthGet(new Request("http://x/api/health"))).status, 200);
});

test("CORS: allowed origin echoed, others get no CORS headers", async () => {
  const ok = await healthGet(new Request("http://x/api/health", { headers: { Origin: "https://app.example.com" } }));
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://app.example.com");
  const no = await healthGet(new Request("http://x/api/health", { headers: { Origin: "https://evil.example" } }));
  assert.equal(no.headers.get("access-control-allow-origin"), null);
});

test("rate limit (in-memory dev fallback): 429 after limit", async () => {
  setEnv({ RBX404_RATE_LIMIT_PER_MINUTE: "2" });
  const cfg = loadConfig();
  await checkRateLimit(cfg, "k"); await checkRateLimit(cfg, "k");
  await assert.rejects(() => checkRateLimit(cfg, "k"), (e: any) => e.status === 429 && Boolean(e.headers["Retry-After"]));
  assert.equal((await openaiPost(post("/v1/chat/completions", body))).status, 200); // different key id
});

test("rate limit (Upstash REST, mocked): uses INCR pipeline, fails closed on error", async () => {
  setEnv({ UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "tok", RBX404_RATE_LIMIT_PER_MINUTE: "1" });
  m.restore();
  let n = 0;
  m = mockFetch(() => json([{ result: ++n }, { result: 1 }]));
  const cfg = loadConfig();
  await checkRateLimit(cfg, "k");
  await assert.rejects(() => checkRateLimit(cfg, "k"), (e: any) => e.status === 429);
  m.restore();
  m = mockFetch(() => new Error("down"));
  await assert.rejects(() => checkRateLimit(cfg, "k"), (e: any) => e.status === 500);
});
