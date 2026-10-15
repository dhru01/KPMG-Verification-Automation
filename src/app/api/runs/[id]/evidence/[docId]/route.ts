import type { NextRequest } from "next/server";
import type { EvidenceDocument } from "@/lib/types";
import { handleError, requireUser } from "@/lib/server/http";
import { deleteEvidenceDocument, updateEvidenceDocument } from "@/lib/server/service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const user = requireUser(request);
    const { id, docId } = await context.params;
    const body = (await request.json()) as Partial<
      Pick<EvidenceDocument, "documentType" | "facility" | "category" | "reportingMonth" | "reportingYear" | "classificationConfirmed">
    >;
    return Response.json({ run: await updateEvidenceDocument(user, id, docId, body) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const user = requireUser(request);
    const { id, docId } = await context.params;
    return Response.json({ run: await deleteEvidenceDocument(user, id, docId) });
  } catch (error) {
    return handleError(error);
  }
}
