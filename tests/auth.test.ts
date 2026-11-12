import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticate, extractKey } from "../lib/auth.ts";
import { ApiError } from "../lib/errors.ts";

const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });

test("extracts Bearer and x-api-key", () => {
  assert.equal(extractKey(req({ authorization: "Bearer abc" })), "abc");
  assert.equal(extractKey(req({ "x-api-key": "xyz" })), "xyz");
  assert.equal(extractKey(req({})), null);
});

test("valid key authenticates and returns a non-reversible id", () => {
  const id = authenticate(req({ authorization: "Bearer k1" }), ["k0", "k1"]);
  assert.equal(id.length, 12);
  assert.notEqual(id, "k1");
});

test("missing key -> 401 missing_api_key", () => {
  assert.throws(() => authenticate(req({}), ["k"]), (e: ApiError) => e.status === 401 && e.code === "missing_api_key");
});

test("wrong key -> 401 invalid_api_key", () => {
  assert.throws(() => authenticate(req({ authorization: "Bearer nope" }), ["k"]), (e: ApiError) => e.status === 401 && e.code === "invalid_api_key");
});
