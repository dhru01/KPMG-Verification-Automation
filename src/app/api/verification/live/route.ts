import type { NextRequest } from "next/server";
import { MONTHS } from "@/lib/records";
import { handleError, requireUser } from "@/lib/server/http";
import { getVerificationLive } from "@/lib/server/service";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    const month = request.nextUrl.searchParams.get("month");
    const yearRaw = request.nextUrl.searchParams.get("year");
    const year = yearRaw ? Number(yearRaw) : NaN;
    if (!month || !MONTHS.includes(month) || !Number.isInteger(year)) {
      return Response.json({ error: "Select a reporting month and year." }, { status: 400 });
    }
    return Response.json(await getVerificationLive(month, year));
  } catch (error) {
    return handleError(error);
  }
}
