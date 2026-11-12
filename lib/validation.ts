import type { Config } from "./env.ts";
import { errors } from "./errors.ts";

const ROLES = new Set(["system", "developer", "user", "assistant", "tool"]);
const ALLOWED_PARAMS = new Set([
  "model", "messages", "temperature", "top_p", "max_tokens", "max_completion_tokens", "stream",
  "stream_options", "stop", "presence_penalty", "frequency_penalty", "n", "seed", "user",
  "tools", "tool_choice", "response_format",
]);
const MAX_MESSAGES = 200;

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateModel(model: unknown, cfg: Config): string {
  if (typeof model !== "string" || !model) throw errors.invalid("'model' is required.", "model");
  if (!Object.prototype.hasOwnProperty.call(cfg.modelMap, model)) throw errors.unsupportedModel(model);
  return model;
}

export function resolveUpstreamModel(publicModel: string, cfg: Config): string {
  return cfg.modelMap[publicModel];
}

export function validateMessages(messages: unknown): any[] {
  if (!Array.isArray(messages) || messages.length === 0) throw errors.invalid("'messages' must be a non-empty array.", "messages");
  if (messages.length > MAX_MESSAGES) throw errors.invalid(`'messages' may contain at most ${MAX_MESSAGES} items.`, "messages");
  for (const m of messages) {
    if (!isObj(m) || !ROLES.has(m.role)) throw errors.invalid("Each message needs a valid 'role'.", "messages");
    const c = m.content;
    const okContent = typeof c === "string" || Array.isArray(c) || (c === null && m.role === "assistant");
    if (!okContent) throw errors.invalid("Each message needs 'content' as a string or array.", "messages");
  }
  return messages;
}

function checkNumbers(b: Record<string, any>, cfg: Config): void {
  if (b.temperature !== undefined && !(typeof b.temperature === "number" && b.temperature >= 0 && b.temperature <= 2))
    throw errors.invalid("'temperature' must be a number between 0 and 2.", "temperature");
  if (b.top_p !== undefined && !(typeof b.top_p === "number" && b.top_p > 0 && b.top_p <= 1))
    throw errors.invalid("'top_p' must be a number in (0, 1].", "top_p");
  for (const p of ["max_tokens", "max_completion_tokens"]) {
    if (b[p] === undefined) continue;
    if (!Number.isInteger(b[p]) || b[p] < 1) throw errors.invalid(`'${p}' must be a positive integer.`, p);
    if (b[p] > cfg.maxTokens) throw errors.invalid(`'${p}' may not exceed ${cfg.maxTokens}.`, p);
  }
  if (b.stream !== undefined && typeof b.stream !== "boolean") throw errors.invalid("'stream' must be a boolean.", "stream");
  if (b.n !== undefined && b.n !== 1) throw errors.invalid("Only n=1 is supported.", "n");
}

/** OpenAI body -> body forwarded upstream. Prompts are never modified. */
export function validateOpenAIBody(body: unknown, cfg: Config): Record<string, any> {
  if (!isObj(body)) throw errors.invalid("Request body must be a JSON object.");
  for (const k of Object.keys(body)) {
    if (!ALLOWED_PARAMS.has(k)) throw errors.invalid(`Unsupported parameter '${k}'.`, k);
  }
  const publicModel = validateModel(body.model, cfg);
  validateMessages(body.messages);
  checkNumbers(body, cfg);
  const out: Record<string, any> = {
  ...body,
  model: resolveUpstreamModel(publicModel, cfg),
};
  if (out.max_tokens === undefined && out.max_completion_tokens === undefined) out.max_tokens = cfg.maxTokens; // cap only
  return out;
}

const CUSTOM_PARAMS = new Set(["model", "prompt", "system", "messages", "temperature", "top_p", "max_tokens", "stream"]);

export function validateCustomBody(body: unknown, cfg: Config): Record<string, any> {
  if (!isObj(body)) throw errors.invalid("Request body must be a JSON object.");
  for (const k of Object.keys(body)) {
    if (!CUSTOM_PARAMS.has(k)) throw errors.invalid(`Unsupported parameter '${k}'.`, k);
  }
  const publicModel = validateModel(body.model, cfg);
  if (body.system !== undefined && typeof body.system !== "string") throw errors.invalid("'system' must be a string.", "system");
  let messages: any[];
  if (body.messages !== undefined) {
    if (body.prompt !== undefined) throw errors.invalid("Provide either 'prompt' or 'messages', not both.");
    messages = [...validateMessages(body.messages)];
  } else {
    if (typeof body.prompt !== "string" || !body.prompt.trim()) throw errors.invalid("'prompt' (string) or 'messages' is required.", "prompt");
    messages = [{ role: "user", content: body.prompt }];
  }
  if (body.system) messages.unshift({ role: "system", content: body.system });
  checkNumbers(body, cfg);
  const out: Record<string, any> = { model: resolveUpstreamModel(publicModel, cfg), messages };
  for (const k of ["temperature", "top_p", "stream"]) if (body[k] !== undefined) out[k] = body[k];
  out.max_tokens = body.max_tokens ?? cfg.maxTokens;
  return out;
}
