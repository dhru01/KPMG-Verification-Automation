import type { NextRequest } from "next/server";
import type { AppliedSheetMapping } from "@/lib/excel/types";
import { handleError, requireUser } from "@/lib/server/http";
import { applyMapping } from "@/lib/server/service";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const body = (await request.json()) as { sheets?: AppliedSheetMapping[] };
    if (!body.sheets?.length) {
      return Response.json({ error: "Provide a column mapping for each worksheet." }, { status: 400 });
    }
    return Response.json({ run: await applyMapping(user, id, body.sheets) });
  } catch (error) {
    return handleError(error);
  }
}
