import type { Ctx } from "./guard.ts";
import { brandOpenAI, customChatBody, jsonResponse, PROVIDER, DEVELOPER, CHANNEL } from "./http.ts";
import { callRespan } from "./respan.ts";
import { validateCustomBody, validateModel, validateOpenAIBody } from "./validation.ts";

const SSE_HEADERS = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

function rewriteSSEModel(body: ReadableStream<Uint8Array> | null, publicModel: string): ReadableStream<Uint8Array> | null {
  if (!body) return null;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  const rewriteLine = (line: string) => {
    if (!line.startsWith("data:")) return line;
    const prefix = "data:";
    const data = line.slice(prefix.length);
    if (!data.trim() || data.trim() === "[DONE]") return line;
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object" && "model" in parsed) parsed.model = publicModel;
      return prefix + JSON.stringify(parsed);
    } catch {
      return line;
    }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          pending += decoder.decode();
          if (pending) {
            const clean = pending.replace(/\\r$/, "");
            controller.enqueue(encoder.encode(rewriteLine(clean)));
          }
          controller.close();
          return;
        }
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\\n");
        pending = lines.pop() ?? "";
        if (lines.length) {
          const output = lines.map((line) => {
            const hasCR = line.endsWith("\\r");
            return rewriteLine(hasCR ? line.slice(0, -1) : line) + (hasCR ? "\\r\\n" : "\\n");
          }).join("");
          controller.enqueue(encoder.encode(output));
          return;
        }
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

async function forward(ctx: Ctx, payload: Record<string, any>, publicModel: string, shape: (u: any) => unknown): Promise<Response> {
  const upstream = await callRespan(ctx.cfg, payload);
  if (payload.stream === true) {
    // Preserve SSE events while replacing upstream model IDs with the public RBX404 alias.
    return new Response(rewriteSSEModel(upstream.body, publicModel), { status: 200, headers: SSE_HEADERS });
  }
  return jsonResponse(shape(await upstream.json()));
}

export const openaiChat = (ctx: Ctx) => {
  const publicModel = validateModel((ctx.body as any)?.model, ctx.cfg);
  const payload = validateOpenAIBody(ctx.body, ctx.cfg);
  return forward(ctx, payload, publicModel, (u) => brandOpenAI(u, ctx.requestId, publicModel));
};

export const customChat = (ctx: Ctx) => {
  const publicModel = validateModel((ctx.body as any)?.model, ctx.cfg);
  const payload = validateCustomBody(ctx.body, ctx.cfg);
  return forward(ctx, payload, publicModel, (u) => customChatBody(u, publicModel, ctx.requestId));
};

export const listModels = async (ctx: Ctx) =>
  jsonResponse({
    object: "list",
    data: ctx.cfg.allowedModels.map((id) => ({ id, object: "model", owned_by: "rbx404" })),
    rbx404: { provider: PROVIDER, developer: DEVELOPER, channel: CHANNEL, request_id: ctx.requestId },
  });

export const health = async (ctx: Ctx) =>
  jsonResponse({ status: "ok", service: PROVIDER, developer: DEVELOPER, channel: CHANNEL, request_id: ctx.requestId });
