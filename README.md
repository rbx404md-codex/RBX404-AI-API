# RBX404 AI API

Branded AI gateway on **Vercel** (Next.js App Router, TypeScript) that forwards to the **Respan Gateway**.
Two formats: OpenAI-compatible and a simple custom RBX404 format.
Developer: **RBX404** · Channel: https://t.me/BlackoutZoneRBX404

## Features
- `POST /v1/chat/completions` (streaming + non-streaming), `GET /v1/models`
- `POST /api/chat` custom format (`prompt`/`system` or `messages`), `GET /api/health`
- Client API keys (Bearer or `x-api-key`), constant-time compare
- Persistent rate limiting via Upstash Redis REST (in-memory only in non-production)
- Public RBX404 model aliases mapped server-side to real Respan model IDs; clients never need upstream model IDs
- Parameter allowlist, token cap, body-size cap, message validation (prompts are never rewritten; no moderation is claimed)
- Normalized OpenAI-style errors; no stack traces or secrets in responses/logs
- Branding: `rbx404` object (OpenAI format), `credits` (custom format), `X-RBX404-*` headers on every response incl. streams

## Architecture
```
app/v1/chat/completions, app/v1/models, app/api/chat, app/api/health   (thin routes)
lib/guard.ts      config -> auth -> rate limit -> body -> handler (+CORS, headers)
lib/handlers.ts   endpoint logic     lib/respan.ts   upstream call + error mapping
lib/validation.ts lib/auth.ts lib/rate-limit.ts lib/env.ts lib/errors.ts lib/http.ts
tests/            node:test suite, Respan/Upstash fully mocked
```

## Environment variables
| Name | Purpose |
|---|---|
| `RESPAN_API_KEY` | Rotated Respan gateway key (server only) |
| `RBX404_API_KEYS` | Comma-separated client keys |
| `RBX404_MODEL_MAP` | JSON object mapping public aliases to actual Respan model IDs; preferred |
| `RBX404_ALLOWED_MODELS` | Legacy comma-separated identity-mapped model IDs; used only when `RBX404_MODEL_MAP` is unset |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Required in production |
| `CORS_ORIGINS` | Comma-separated origins or `*`; empty = no CORS headers |
Optional: `RBX404_MAX_TOKENS` (4096), `RBX404_MAX_BODY_BYTES` (100000), `RBX404_RATE_LIMIT_PER_MINUTE` (30), `RBX404_UPSTREAM_TIMEOUT_MS` (55000).

### Custom model aliases

Set `RBX404_MODEL_MAP` to a JSON object in Vercel Environment Variables, for example:

```json
{"rbx404-smart":"YOUR_REAL_RESPAN_MODEL_ID","rbx404-fast":"YOUR_OTHER_RESPAN_MODEL_ID"}
```

Replace the placeholder values with model IDs that actually exist in your Respan catalog. Clients call `rbx404-smart` or `rbx404-fast`; `/v1/models` lists only these public aliases. The gateway maps each alias to its upstream ID server-side and rewrites the model name in non-streaming responses and SSE chunks. Do not put secrets in this mapping.

For Vercel's environment variable editor, paste the JSON as a single line. If `RBX404_MODEL_MAP` is set, it takes precedence over the legacy `RBX404_ALLOWED_MODELS`.

## Local development
```bash
npm install
cp .env.example .env.local   # fill values
npm run dev
npm test && npm run typecheck
```
Requires Node >= 22.6 (tests use Node's built-in runner with type stripping).

## Deploy to Vercel
1. Push to Git, import the repo in Vercel (framework: Next.js).
2. Project **Settings → Environment Variables**: add every variable above for Production (and Preview if wanted).
3. Create an Upstash Redis database (or Vercel Marketplace integration) and copy its REST URL/token.
4. Deploy, then verify: `curl https://<your-app>.vercel.app/api/health`.
`maxDuration` is 60s on chat routes; adjust to your Vercel plan limits.

## Usage
```bash
# OpenAI-compatible
curl https://<host>/v1/chat/completions \
  -H "Authorization: Bearer $RBX404_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gemini-flash","messages":[{"role":"user","content":"Hello!"}]}'

# Custom
curl https://<host>/api/chat \
  -H "Authorization: Bearer $RBX404_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gemini-flash","prompt":"Hello!","system":"You are helpful","max_tokens":512}'

# Streaming (both endpoints, "stream": true) - OpenAI-style SSE passed through unchanged
curl -N https://<host>/v1/chat/completions -H "Authorization: Bearer $RBX404_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-flash","stream":true,"messages":[{"role":"user","content":"Hi"}]}'
```
OpenAI response = upstream body + `"rbx404": {provider, developer, channel, request_id}`. Its `model` field is rewritten to the public RBX404 alias. SSE chunks also expose the public alias, not the upstream ID.
Custom response: `{success, provider, model, response, usage, credits{developer,channel}, request_id}`; `model` is the public RBX404 alias. `usage` is `null` if the provider returned none. `/api/chat` streams are OpenAI-format chunks.

## Error codes
`missing_api_key`/`invalid_api_key` 401 · `model_not_found`, `invalid_request`, `invalid_json` 400 · `request_too_large` 413 · `rate_limit_exceeded` 429 (+`Retry-After`) · `upstream_auth_error`, `upstream_error`, `upstream_unreachable` 502 · `upstream_timeout` 504 · `server_misconfigured`, `internal_error` 500.

## Security notes
Never commit keys; rotate any key that was shared in chat. Respan key is used server-side only. Rate-limit store failures fail closed. Logs contain request id, path, status, latency and a hashed key id only.

## Credits
Built by RBX404 — https://t.me/BlackoutZoneRBX404
