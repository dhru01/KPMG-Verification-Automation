import type { NextRequest } from "next/server";
import { handleError, readFormFile, requireUser } from "@/lib/server/http";
import { clearTemplate, uploadTemplate } from "@/lib/server/service";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    return Response.json({ run: await clearTemplate(user, id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const file = await readFormFile(request, ["xlsx", "xls"]);
    return Response.json({ run: await uploadTemplate(user, id, file) });
  } catch (error) {
    return handleError(error);
  }
}
