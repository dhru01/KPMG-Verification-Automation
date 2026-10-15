import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  try {
    return Response.json({ user: requireUser(request) });
  } catch (error) {
    return handleError(error);
  }
}
