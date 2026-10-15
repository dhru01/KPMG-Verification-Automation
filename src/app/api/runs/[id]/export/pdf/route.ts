import type { NextRequest } from "next/server";
import { buildPdfReport } from "@/lib/server/reports";
import { readDatabase } from "@/lib/server/store";
import { handleError, HttpError, requireUser } from "@/lib/server/http";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireUser(request);
    const { id } = await context.params;
    const database = await readDatabase();
    const run = database.runs.find((item) => item.id === id);
    if (!run) throw new HttpError(404, "Verification run not found.");
    if (run.results.length === 0) throw new HttpError(400, "Run verification before exporting a report.");
    const bytes = await buildPdfReport(run);
    const filename = `ghg-verification-${run.reportingMonth}-${run.reportingYear}.pdf`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
