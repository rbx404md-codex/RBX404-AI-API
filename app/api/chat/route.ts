import { handleRequest, optionsResponse } from "../../../lib/guard.ts";
import { customChat } from "../../../lib/handlers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (req: Request) => handleRequest(req, "custom", customChat);
export const OPTIONS = (req: Request) => optionsResponse(req);
