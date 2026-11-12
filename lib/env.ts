import { ApiError } from "./errors.ts";

export interface Config {
  respanKey: string;
  respanBaseUrl: string;
  clientKeys: string[];
  allowedModels: string[];
  modelMap: Record<string, string>;
  corsOrigins: string[];
  upstashUrl: string | null;
  upstashToken: string | null;
  maxTokens: number;
  maxBodyBytes: number;
  rateLimitPerMinute: number;
  upstreamTimeoutMs: number;
  production: boolean;
}

const list = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const production = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  const missing: string[] = [];
  if (!env.RESPAN_API_KEY) missing.push("RESPAN_API_KEY");
  if (list(env.RBX404_API_KEYS).length === 0) missing.push("RBX404_API_KEYS");
  let modelMap: Record<string, string> = {};
  if (env.RBX404_MODEL_MAP?.trim()) {
    try {
      const parsed: unknown = JSON.parse(env.RBX404_MODEL_MAP);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid model map");
      for (const [alias, upstream] of Object.entries(parsed as Record<string, unknown>)) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(alias) || typeof upstream !== "string" || !upstream.trim()) {
          throw new Error("invalid model map entry");
        }
        modelMap[alias] = upstream.trim();
      }
    } catch {
      throw new ApiError(500, "server_misconfigured", "RBX404_MODEL_MAP must be a valid JSON object mapping public model names to upstream model IDs.", "server_error");
    }
  } else {
    // Backward compatibility: old allowlist entries are exposed unchanged.
    for (const id of list(env.RBX404_ALLOWED_MODELS)) modelMap[id] = id;
  }
  if (Object.keys(modelMap).length === 0) missing.push("RBX404_MODEL_MAP or RBX404_ALLOWED_MODELS");
  const upstashUrl = env.UPSTASH_REDIS_REST_URL || null;
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN || null;
  if (production && (!upstashUrl || !upstashToken)) {
    missing.push("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN");
  }
  if (missing.length) {
    // Log names only (never values); the client sees a generic message.
    console.error(JSON.stringify({ level: "error", msg: "missing env", missing }));
    throw new ApiError(500, "server_misconfigured", "Server is not configured correctly.", "server_error");
  }
  return {
    respanKey: env.RESPAN_API_KEY as string,
    respanBaseUrl: (env.RESPAN_BASE_URL || "https://gateway.respan.ai").replace(/\/+$/, ""),
    clientKeys: list(env.RBX404_API_KEYS),
    allowedModels: Object.keys(modelMap),
    modelMap,
    corsOrigins: list(env.CORS_ORIGINS),
    upstashUrl,
    upstashToken,
    maxTokens: num(env.RBX404_MAX_TOKENS, 4096),
    maxBodyBytes: num(env.RBX404_MAX_BODY_BYTES, 100_000),
    rateLimitPerMinute: num(env.RBX404_RATE_LIMIT_PER_MINUTE, 30),
    upstreamTimeoutMs: num(env.RBX404_UPSTREAM_TIMEOUT_MS, 55_000),
    production,
  };
}
