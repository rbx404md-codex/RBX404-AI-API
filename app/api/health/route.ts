import { handleRequest, optionsResponse } from "../../../lib/guard.ts";
import { health } from "../../../lib/handlers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = (req: Request) => handleRequest(req, "custom", health, { auth: false, readBody: false });
export const OPTIONS = (req: Request) => optionsResponse(req);
