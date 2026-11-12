import { test } from "node:test";
import assert from "node:assert/strict";
import { brandOpenAI, customChatBody, errorResponse } from "../lib/http.ts";
import { errors } from "../lib/errors.ts";
import { upstreamOk } from "./helpers.ts";

test("OpenAI branding preserves fields and adds rbx404", () => {
  const out: any = brandOpenAI(upstreamOk, "rbx_1");
  assert.equal(out.id, upstreamOk.id);
  assert.deepEqual(out.choices, upstreamOk.choices);
  assert.equal(out.rbx404.developer, "RBX404");
  assert.equal(out.rbx404.channel, "https://t.me/BlackoutZoneRBX404");
});

test("custom body maps real usage; missing usage -> null (never fabricated)", () => {
  const out: any = customChatBody(upstreamOk, "gemini-flash", "rbx_1");
  assert.equal(out.success, true);
  assert.equal(out.response, "Hello! How can I help?");
  assert.deepEqual(out.usage, { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 });
  assert.equal(out.credits.developer, "RBX404");
  const none: any = customChatBody({ choices: [{ message: { content: "x" } }] }, "m", "r");
  assert.equal(none.usage, null);
});

test("error normalization for both formats", async () => {
  const o: any = await errorResponse(errors.invalidAuth(), "openai", "r1").json();
  assert.equal(o.error.code, "invalid_api_key");
  const c: any = await errorResponse(errors.timeout(), "custom", "r2").json();
  assert.equal(c.success, false);
  assert.equal(c.error.code, "upstream_timeout");
});
