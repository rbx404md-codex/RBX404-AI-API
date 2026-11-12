import type { Config } from "./env.ts";
import { errors } from "./errors.ts";
import type { ApiError } from "./errors.ts";

/** POST {base}/v1/chat/completions (documented Respan Gateway endpoint). The Respan key never leaves the server. */
export async function callRespan(cfg: Config, payload: Record<string, unknown>): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${cfg.respanBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.respanKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.upstreamTimeoutMs),
    });
  } catch (e: any) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") throw errors.timeout();
    throw errors.network();
  }
  if (!res.ok) throw await mapUpstreamError(res);
  return res;
}

export async function mapUpstreamError(res: Response): Promise<ApiError> {
  let msg = "";
  try {
    const j: any = await res.json();
    msg = String(j?.error?.message ?? j?.message ?? j?.detail ?? "").slice(0, 300);
  } catch { /* ignore */ }
  if (res.status === 401 || res.status === 403) return errors.upstreamAuth();
  if (res.status === 429) return errors.rateLimited(30);
  if (res.status === 400 || res.status === 404 || res.status === 422) {
    return errors.invalid(msg || "The upstream provider rejected the request.");
  }
  return errors.upstream();
}
