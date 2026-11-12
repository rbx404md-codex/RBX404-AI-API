import { handleRequest, optionsResponse } from "../../../lib/guard.ts";
import { listModels } from "../../../lib/handlers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = (req: Request) => handleRequest(req, "openai", listModels, { readBody: false });
export const OPTIONS = (req: Request) => optionsResponse(req);
