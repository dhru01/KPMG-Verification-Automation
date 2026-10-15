import { HttpError } from "./http";
import { getSupabaseAdmin } from "./supabase-admin";

export const SUPABASE_UPLOAD_BUCKET = "ghg-hub-uploads";
const SCHEME = `supabase://${SUPABASE_UPLOAD_BUCKET}/`;

export function supabaseStoragePath(runId: string, storedName: string): string {
  return `${SCHEME}${runId}/${storedName}`;
}

export function parseSupabaseStoragePath(storagePath: string): { bucket: string; objectPath: string } | null {
  if (!storagePath.startsWith(SCHEME)) return null;
  return { bucket: SUPABASE_UPLOAD_BUCKET, objectPath: storagePath.slice(SCHEME.length) };
}

export async function uploadToSupabase(runId: string, storedName: string, bytes: Buffer): Promise<string> {
  const supabase = getSupabaseAdmin();
  const objectPath = `${runId}/${storedName}`;
  const { error } = await supabase.storage.from(SUPABASE_UPLOAD_BUCKET).upload(objectPath, bytes, {
    upsert: true,
    contentType: "application/octet-stream",
  });
  if (error) {
    throw new HttpError(
      503,
      `File could not be saved to Supabase Storage. Create bucket "${SUPABASE_UPLOAD_BUCKET}" (see supabase/migrations/002_workspace_snapshot.sql). (${error.message})`,
    );
  }
  return supabaseStoragePath(runId, storedName);
}

export async function downloadFromSupabase(storagePath: string): Promise<Buffer> {
  const parsed = parseSupabaseStoragePath(storagePath);
  if (!parsed) throw new HttpError(400, "Invalid Supabase storage path.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.objectPath);
  if (error || !data) {
    throw new HttpError(404, "Uploaded file could not be retrieved.");
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function removeFromSupabase(storagePath: string) {
  const parsed = parseSupabaseStoragePath(storagePath);
  if (!parsed) return;
  const supabase = getSupabaseAdmin();
  await supabase.storage.from(parsed.bucket).remove([parsed.objectPath]);
}

export async function deleteSupabaseRunFolder(runId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(SUPABASE_UPLOAD_BUCKET).list(runId, { limit: 200 });
  if (error) return;
  const paths = (data ?? []).map((item) => `${runId}/${item.name}`);
  if (paths.length > 0) {
    await supabase.storage.from(SUPABASE_UPLOAD_BUCKET).remove(paths);
  }
}
