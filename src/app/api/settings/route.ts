import type { NextRequest } from "next/server";
import type { ToleranceConfig } from "@engine/shared/types";
import { handleError, requireUser } from "@/lib/server/http";
import { getWorkspaceSettings, updateWorkspaceSettings } from "@/lib/server/service";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    return Response.json(await getWorkspaceSettings());
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = requireUser(request);
    const body = (await request.json()) as { tolerance?: ToleranceConfig; region?: string };
    return Response.json({ settings: await updateWorkspaceSettings(user, body) });
  } catch (error) {
    return handleError(error);
  }
}
