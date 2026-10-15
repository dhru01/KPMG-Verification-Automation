import type { NextRequest } from "next/server";
import { fileExtension } from "@/lib/utils";
import { handleError, requireUser } from "@/lib/server/http";
import { readEvidenceFile } from "@/lib/server/service";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    requireUser(request);
    const { id, docId } = await context.params;
    const { document, bytes } = await readEvidenceFile(id, docId);
    const extension = fileExtension(document.filename);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${document.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
