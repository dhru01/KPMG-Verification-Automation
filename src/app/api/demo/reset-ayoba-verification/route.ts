import type { NextRequest } from "next/server";
import { MONTHS } from "@/lib/records";
import { handleError, requireUser } from "@/lib/server/http";
import { resetAyobaDemoVerification } from "@/lib/server/service";

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request);
    const body = (await request.json()) as { reportingMonth?: string; reportingYear?: number };
    const reportingMonth = body.reportingMonth;
    const reportingYear = Number(body.reportingYear);
    if (!reportingMonth || !MONTHS.includes(reportingMonth) || !Number.isInteger(reportingYear)) {
      return Response.json({ error: "Select a reporting month and year." }, { status: 400 });
    }
    return Response.json(await resetAyobaDemoVerification(user, reportingMonth, reportingYear));
  } catch (error) {
    return handleError(error);
  }
}
