import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";
import { listAudit } from "@/lib/server/service";

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request);
    return Response.json({ entries: await listAudit(user) });
  } catch (error) {
    return handleError(error);
  }
}
