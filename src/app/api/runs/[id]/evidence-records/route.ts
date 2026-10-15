import type { NextRequest } from "next/server";
import type { EvidenceRecord } from "@/lib/types";
import { handleError, HttpError, requireUser } from "@/lib/server/http";
import { createEvidenceRecord, updateEvidenceRecords } from "@/lib/server/service";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const body = (await request.json()) as { documentId?: string };
    if (!body.documentId) throw new HttpError(400, "Choose a document to add a value for.");
    return Response.json({ run: await createEvidenceRecord(user, id, body.documentId) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const body = (await request.json()) as { records?: EvidenceRecord[] };
    return Response.json({ run: await updateEvidenceRecords(user, id, body.records ?? []) });
  } catch (error) {
    return handleError(error);
  }
}
