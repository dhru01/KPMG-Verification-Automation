import { HttpError } from "./http";

export function kvWorkspaceEnabled(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function blobUploadsEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function hostedOnVercel(): boolean {
  return process.env.VERCEL === "1";
}

/** Vercel serverless has no durable local disk; require KV for shared pilot data. */
export function assertWorkspacePersistence(): void {
  if (hostedOnVercel() && !kvWorkspaceEnabled()) {
    throw new HttpError(
      503,
      "Shared workspace storage is not configured. Connect Vercel KV to this project and redeploy (see README: Deploy on Vercel).",
    );
  }
}
