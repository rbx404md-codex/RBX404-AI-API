import { createHash, timingSafeEqual } from "node:crypto";
import { errors } from "./errors.ts";

const sha = (s: string): Buffer => createHash("sha256").update(s).digest();

export function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  return req.headers.get("x-api-key")?.trim() || null;
}

/** Constant-time check against every configured key (no early exit). Returns a non-reversible key id. */
export function authenticate(req: Request, validKeys: string[]): string {
  const key = extractKey(req);
  if (!key) throw errors.missingAuth();
  const given = sha(key);
  let ok = false;
  for (const k of validKeys) ok = timingSafeEqual(given, sha(k)) || ok;
  if (!ok) throw errors.invalidAuth();
  return given.toString("hex").slice(0, 12);
}
