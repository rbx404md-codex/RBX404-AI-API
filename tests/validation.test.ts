import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../lib/env.ts";
import { validateCustomBody, validateOpenAIBody } from "../lib/validation.ts";
import { setEnv } from "./helpers.ts";

beforeEach(() => setEnv());
const msgs = [{ role: "user", content: "hi" }];
const bad = (code: string) => (e: any) => e.code === code;

test("rejects unlisted model", () => {
  assert.throws(() => validateOpenAIBody({ model: "other", messages: msgs }, loadConfig()), bad("model_not_found"));
});

test("rejects unsupported parameters and bad messages", () => {
  const cfg = loadConfig();
  assert.throws(() => validateOpenAIBody({ model: "gpt-test", messages: msgs, logit_bias: {} }, cfg), bad("invalid_request"));
  assert.throws(() => validateOpenAIBody({ model: "gpt-test", messages: [] }, cfg), bad("invalid_request"));
  assert.throws(() => validateOpenAIBody({ model: "gpt-test", messages: [{ role: "bob", content: "x" }] }, cfg), bad("invalid_request"));
});

test("enforces max token limit and leaves prompts untouched", () => {
  const cfg = loadConfig();
  assert.throws(() => validateOpenAIBody({ model: "gpt-test", messages: msgs, max_tokens: 99999 }, cfg), bad("invalid_request"));
  const out = validateOpenAIBody({ model: "gpt-test", messages: msgs, temperature: 0.5 }, cfg);
  assert.deepEqual(out.messages, msgs);
  assert.equal(out.max_tokens, 2048);
});

test("custom body: prompt+system -> messages; rejects prompt+messages", () => {
  const cfg = loadConfig();
  const out = validateCustomBody({ model: "gemini-flash", prompt: "Hello!", system: "Be nice" }, cfg);
  assert.deepEqual(out.messages, [{ role: "system", content: "Be nice" }, { role: "user", content: "Hello!" }]);
  assert.throws(() => validateCustomBody({ model: "gemini-flash", prompt: "a", messages: msgs }, cfg), bad("invalid_request"));
});


test("public alias resolves to configured upstream model ID", () => {
  setEnv({ RBX404_MODEL_MAP: JSON.stringify({ "rbx404-smart": "vendor/actual-model" }), RBX404_ALLOWED_MODELS: undefined });
  const cfg = loadConfig();
  const out = validateOpenAIBody({ model: "rbx404-smart", messages: msgs }, cfg);
  assert.equal(out.model, "vendor/actual-model");
  assert.throws(() => validateOpenAIBody({ model: "vendor/actual-model", messages: msgs }, cfg), bad("model_not_found"));
});

test("invalid model map fails closed", () => {
  setEnv({ RBX404_MODEL_MAP: "{not-json}", RBX404_ALLOWED_MODELS: undefined });
  assert.throws(() => loadConfig(), (e: any) => e.code === "server_misconfigured");
});

test("production without Upstash fails config validation", () => {
  setEnv({ NODE_ENV: "production" });
  assert.throws(() => loadConfig(), (e: any) => e.code === "server_misconfigured");
});
