import type { NextRequest } from "next/server";
import { handleError, requireUser } from "@/lib/server/http";
import { processorHealth } from "@/lib/server/processor";
import { readDatabase } from "@/lib/server/store";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/server/supabase-admin";
import {
  hostedOnVercel,
  kvWorkspaceEnabled,
  supabaseWorkspaceEnabled,
} from "@/lib/server/workspace-mode";

export async function GET(request: NextRequest) {
  try {
    requireUser(request);
    const processor = await processorHealth();
    let workspace: { status: "ok" | "error"; mode: string; detail?: string };
    try {
      await readDatabase();
      workspace = {
        status: "ok",
        mode: kvWorkspaceEnabled()
          ? "vercel-kv"
          : supabaseWorkspaceEnabled()
            ? "supabase-storage"
            : hostedOnVercel()
              ? "unconfigured"
              : "local-disk",
      };
    } catch (error) {
      workspace = {
        status: "error",
        mode: supabaseWorkspaceEnabled() ? "supabase-storage" : "unknown",
        detail: error instanceof Error ? error.message : "Workspace could not be read.",
      };
    }
    return Response.json({
      processor,
      supabaseConfigured: Boolean(supabaseUrl() && supabaseServiceRoleKey()),
      workspace,
      deployment: {
        host: hostedOnVercel() ? "vercel" : "local",
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
