import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";
import { createDemonstrationRun } from "@/lib/server/service";

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request);
    const run = await createDemonstrationRun(user);
    return Response.json({ run });
  } catch (error) {
    return handleError(error);
  }
}
