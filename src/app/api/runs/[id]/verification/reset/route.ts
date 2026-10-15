import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";
import { resetVerification } from "@/lib/server/service";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { demo?: boolean };
    return Response.json({ run: await resetVerification(user, id, { demo: body.demo === true }) });
  } catch (error) {
    return handleError(error);
  }
}
