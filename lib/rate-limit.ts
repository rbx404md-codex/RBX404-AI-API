import type { Config } from "./env.ts";
import { errors } from "./errors.ts";

const memory = new Map<string, { count: number; reset: number }>();

/** Fixed 60s window. Upstash REST when configured; in-memory fallback is for local dev only. */
export async function checkRateLimit(cfg: Config, keyId: string, now = Date.now()): Promise<void> {
  const windowSec = 60;
  const bucket = Math.floor(now / 1000 / windowSec);
  const key = `rbx404:rl:${keyId}:${bucket}`;
  let count: number;

  if (cfg.upstashUrl && cfg.upstashToken) {
    let res: Response;
    try {
      res = await fetch(`${cfg.upstashUrl.replace(/\/+$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.upstashToken}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(windowSec * 2)]]),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw errors.internal(); // fail closed
    }
    if (!res.ok) throw errors.internal();
    const out = (await res.json()) as Array<{ result?: number }>;
    count = Number(out?.[0]?.result);
    if (!Number.isFinite(count)) throw errors.internal();
  } else {
    if (cfg.production) throw errors.internal();
    const cur = memory.get(key);
    count = (cur?.count ?? 0) + 1;
    memory.set(key, { count, reset: now + windowSec * 2000 });
    for (const [k, v] of memory) if (v.reset < now) memory.delete(k);
  }

  if (count > cfg.rateLimitPerMinute) {
    throw errors.rateLimited(windowSec - (Math.floor(now / 1000) % windowSec));
  }
}

export const _resetMemoryLimiter = () => memory.clear();
