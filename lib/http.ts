import type { Config } from "./env.ts";
import { ApiError } from "./errors.ts";

export const DEVELOPER = "RBX404";
export const CHANNEL = "https://t.me/BlackoutZoneRBX404";
export const PROVIDER = "RBX404 AI API";

export type Format = "openai" | "custom";

export const newRequestId = (): string => `rbx_${crypto.randomUUID().replace(/-/g, "")}`;

export function brandHeaders(requestId: string): Record<string, string> {
  return { "X-RBX404-Developer": DEVELOPER, "X-RBX404-Channel": CHANNEL, "X-RBX404-Request-ID": requestId };
}

export function corsHeaders(req: Request, origins: string[]): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || origins.length === 0) return {};
  if (!origins.includes("*") && !origins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origins.includes("*") ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key",
    "Access-Control-Expose-Headers": "X-RBX404-Request-ID, Retry-After",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function errorResponse(err: ApiError, format: Format, requestId: string, headers: Record<string, string> = {}): Response {
  const error = { message: err.message, type: err.type, param: err.param, code: err.code };
  const body =
    format === "openai"
      ? { error, rbx404: { provider: PROVIDER, request_id: requestId } }
      : { success: false, provider: PROVIDER, error, credits: { developer: DEVELOPER, channel: CHANNEL } };
  return jsonResponse(body, err.status, { ...err.headers, ...headers });
}

/** Adds branding metadata to an upstream OpenAI-style JSON body without altering its fields. */
export function brandOpenAI(upstream: Record<string, unknown>, requestId: string, publicModel?: string): Record<string, unknown> {
  return { ...upstream, ...(publicModel ? { model: publicModel } : {}), rbx404: { provider: PROVIDER, developer: DEVELOPER, channel: CHANNEL, request_id: requestId } };
}

export function customChatBody(upstream: any, model: string, requestId: string) {
  const content = upstream?.choices?.[0]?.message?.content;
  const u = upstream?.usage;
  return {
    success: true,
    provider: PROVIDER,
    model,
    response: typeof content === "string" ? content : null,
    usage: u
      ? { prompt_tokens: u.prompt_tokens ?? null, completion_tokens: u.completion_tokens ?? null, total_tokens: u.total_tokens ?? null }
      : null,
    credits: { developer: DEVELOPER, channel: CHANNEL },
    request_id: requestId,
  };
}

export async function readJsonBody(req: Request, cfg: Config): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > cfg.maxBodyBytes) throw new ApiError(413, "request_too_large", "Request body is too large.");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > cfg.maxBodyBytes) throw new ApiError(413, "request_too_large", "Request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.", "invalid_request_error");
  }
}
