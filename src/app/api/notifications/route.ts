import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";
import { listNotifications, markNotificationsRead } from "@/lib/server/service";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    return Response.json({ notifications: await listNotifications() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireUser(request);
    await markNotificationsRead();
    return Response.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
