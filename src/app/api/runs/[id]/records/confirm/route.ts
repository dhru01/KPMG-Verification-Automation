import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";
import { confirmRecords } from "@/lib/server/service";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    return Response.json({ run: await confirmRecords(user, id) });
  } catch (error) {
    return handleError(error);
  }
}
