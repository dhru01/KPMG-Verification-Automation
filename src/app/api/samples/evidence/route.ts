import type { NextRequest } from "next/server";
import { buildDemonstrationEvidenceWorkbook } from "@/lib/samples";
import { handleError, requireUser } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    return new Response(new Uint8Array(buildDemonstrationEvidenceWorkbook()), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=\"Ayoba-demonstration-evidence.xlsx\"",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
