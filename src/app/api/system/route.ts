import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";
import { processorHealth } from "@/lib/server/processor";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    const processor = await processorHealth();
    return Response.json({
      processor,
      supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  } catch (error) {
    return handleError(error);
  }
}
