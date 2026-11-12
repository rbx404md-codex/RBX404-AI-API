export function setEnv(extra: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    RESPAN_API_KEY: "test-respan-secret",
    RBX404_API_KEYS: "client-key-1,client-key-2",
    RBX404_ALLOWED_MODELS: "gemini-flash,gpt-test",
    RBX404_MODEL_MAP: undefined,
    CORS_ORIGINS: "https://app.example.com",
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    RBX404_RATE_LIMIT_PER_MINUTE: "1000",
    RBX404_MAX_TOKENS: "2048",
    RBX404_MAX_BODY_BYTES: undefined,
    NODE_ENV: "test",
    VERCEL_ENV: undefined,
  };
  for (const [k, v] of Object.entries({ ...base, ...extra })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

export const upstreamOk = {
  id: "chatcmpl-1", object: "chat.completion", created: 1, model: "gemini-flash",
  choices: [{ index: 0, message: { role: "assistant", content: "Hello! How can I help?" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 },
};

export type Call = { url: string; init: RequestInit };

/** Mocks global fetch (Respan + Upstash). Never hits the network. */
export function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response> | Error) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const r = await handler(url, init);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

export const post = (path: string, body: unknown, key: string | null = "client-key-1", extra: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
