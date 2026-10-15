import type { NextRequest } from "next/server";
import { getOpcoConfiguration } from "@engine/methodologies/registry";
import { buildExcelReport } from "@/lib/server/reports";
import { readDatabase } from "@/lib/server/store";
import { handleError, HttpError, requireUser } from "@/lib/server/http";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireUser(request);
    const { id } = await context.params;
    const database = await readDatabase();
    const run = database.runs.find((item) => item.id === id);
    if (!run) throw new HttpError(404, "Verification run not found.");
    if (run.results.length === 0) throw new HttpError(400, "Run verification before exporting the verification sheet.");
    const bytes = await buildExcelReport(run);
    const opcoLabel = getOpcoConfiguration(run.opcoId)?.name ?? run.opcoId;
    const filename = run.opcoId === "ayoba"
      ? `${opcoLabel} Verification Results Sheet.xlsx`
      : `ghg-verification-${run.reportingMonth}-${run.reportingYear}.xlsx`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
