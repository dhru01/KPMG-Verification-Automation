import { HttpError } from "./http";
import { supabaseServiceRoleKey, supabaseUrl } from "./supabase-admin";

export function kvWorkspaceEnabled(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function supabaseWorkspaceEnabled(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceRoleKey());
}

export function blobUploadsEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function hostedOnVercel(): boolean {
  return process.env.VERCEL === "1";
}

export function remoteWorkspaceEnabled(): boolean {
  return kvWorkspaceEnabled() || supabaseWorkspaceEnabled();
}

/** Vercel serverless has no durable local disk; require cloud workspace storage. */
export function assertWorkspacePersistence(): void {
  if (hostedOnVercel() && !remoteWorkspaceEnabled()) {
    throw new HttpError(
      503,
      "Shared workspace storage is not configured. Add Supabase server env vars (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) or Vercel KV, then redeploy. See README.",
    );
  }
}
