import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";
import { reviewResult } from "@/lib/server/service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; resultId: string }> },
) {
  try {
    const user = requireUser(request);
    const { id, resultId } = await context.params;
    const body = (await request.json()) as {
      action?: "accept" | "flag" | "request_evidence" | "comment";
      comment?: string;
    };
    if (!body.action) return Response.json({ error: "Choose a review action." }, { status: 400 });
    return Response.json({ run: await reviewResult(user, id, resultId, { action: body.action, comment: body.comment }) });
  } catch (error) {
    return handleError(error);
  }
}
