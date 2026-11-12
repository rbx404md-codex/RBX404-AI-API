import { authenticate } from "./auth.ts";
import { loadConfig } from "./env.ts";
import type { Config } from "./env.ts";
import { toApiError } from "./errors.ts";
import { brandHeaders, corsHeaders, errorResponse, newRequestId, readJsonBody } from "./http.ts";
import type { Format } from "./http.ts";
import { checkRateLimit } from "./rate-limit.ts";

export interface Ctx {
  cfg: Config;
  requestId: string;
  body: unknown;
}

/** Pipeline: config -> auth -> rate limit -> body (size + JSON) -> handler. Adds CORS + RBX404 headers to every response. */
export async function handleRequest(
  req: Request,
  format: Format,
  handler: (ctx: Ctx) => Promise<Response>,
  opts: { auth?: boolean; readBody?: boolean } = {},
): Promise<Response> {
  const { auth = true, readBody = true } = opts;
  const requestId = newRequestId();
  const started = Date.now();
  let cors: Record<string, string> = {};
  let keyId = "-";
  let res: Response;
  try {
    const cfg = loadConfig();
    cors = corsHeaders(req, cfg.corsOrigins);
    if (auth) {
      keyId = authenticate(req, cfg.clientKeys);
      await checkRateLimit(cfg, keyId);
    }
    const body = readBody && req.method === "POST" ? await readJsonBody(req, cfg) : undefined;
    res = await handler({ cfg, requestId, body });
  } catch (e) {
    res = errorResponse(toApiError(e), format, requestId);
  }
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...brandHeaders(requestId), ...cors })) headers.set(k, v);
  console.log(JSON.stringify({ level: "info", requestId, method: req.method, path: new URL(req.url).pathname, status: res.status, ms: Date.now() - started, key: keyId }));
  return new Response(res.body, { status: res.status, headers });
}

export function optionsResponse(req: Request): Response {
  let cors: Record<string, string> = {};
  try { cors = corsHeaders(req, loadConfig().corsOrigins); } catch { /* no CORS if misconfigured */ }
  return new Response(null, { status: 204, headers: { ...cors, ...brandHeaders(newRequestId()) } });
}
