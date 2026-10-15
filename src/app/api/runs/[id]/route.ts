import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";
import { getRun } from "@/lib/server/service";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireUser(request);
    const { id } = await context.params;
    return Response.json({ run: await getRun(id) });
  } catch (error) {
    return handleError(error);
  }
}
