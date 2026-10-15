import type { NextRequest } from "next/server";
import { handleError, readFormFile, requireUser } from "@/lib/server/http";
import { addEvidence } from "@/lib/server/service";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const file = await readFormFile(request, ["pdf", "xlsx", "xls", "csv", "png", "jpg", "jpeg"]);
    return Response.json({ run: await addEvidence(user, id, file) });
  } catch (error) {
    return handleError(error);
  }
}
