import type { NextRequest } from "next/server";
import type { ConsumptionRecord } from "@/lib/types";
import { handleError, requireUser } from "@/lib/server/http";
import { updateRecords } from "@/lib/server/service";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const body = (await request.json()) as { records?: ConsumptionRecord[] };
    return Response.json({ run: await updateRecords(user, id, body.records ?? []) });
  } catch (error) {
    return handleError(error);
  }
}
