import type { NextRequest } from "next/server";
import { MONTHS } from "@/lib/records";
import { handleError, requireUser } from "@/lib/server/http";
import { getVerificationAuditSummary } from "@/lib/server/service";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    const month = request.nextUrl.searchParams.get("month");
    const yearRaw = request.nextUrl.searchParams.get("year");
    const year = yearRaw ? Number(yearRaw) : undefined;
    const reportingMonth = month && MONTHS.includes(month) ? month : undefined;
    const reportingYear =
      year !== undefined && Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : undefined;
    return Response.json(
      await getVerificationAuditSummary(
        reportingMonth && reportingYear ? { reportingMonth, reportingYear } : undefined,
      ),
    );
  } catch (error) {
    return handleError(error);
  }
}
