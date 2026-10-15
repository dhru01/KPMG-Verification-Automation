import type { NextRequest } from "next/server";
import type { ScopeSelection } from "@/lib/types";
import { handleError, requireUser } from "@/lib/server/http";
import { createRun, listRuns } from "@/lib/server/service";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    return Response.json({ runs: await listRuns() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request);
    const body = (await request.json()) as {
      opcoId?: string;
      reportingMonth?: string;
      reportingYear?: number;
      scopeSelection?: ScopeSelection;
    };
    const run = await createRun(user, {
      opcoId: body.opcoId ?? "",
      reportingMonth: body.reportingMonth ?? "",
      reportingYear: Number(body.reportingYear),
      scopeSelection: body.scopeSelection ?? "Both",
    });
    return Response.json({ run });
  } catch (error) {
    return handleError(error);
  }
}
