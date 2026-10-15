import { HttpError } from "./http";
import { getSupabaseAdmin } from "./supabase-admin";
import { SUPABASE_UPLOAD_BUCKET } from "./supabase-storage";
import { emptyDatabase, normalizeDatabase, type WorkspaceDatabase } from "./workspace-data";

/** Single JSON document in the uploads bucket (avoids Postgres table grants on Supabase). */
const WORKSPACE_OBJECT = "_workspace/database.json";

function storageNotFound(error: { message?: string }): boolean {
  const message = (error.message ?? "").toLowerCase();
  return message.includes("not found") || message.includes("object not found");
}

async function readStorageWorkspace(): Promise<WorkspaceDatabase> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(SUPABASE_UPLOAD_BUCKET).download(WORKSPACE_OBJECT);
  if (error) {
    if (storageNotFound(error)) return emptyDatabase();
    throw new HttpError(
      503,
      `Supabase workspace could not be read. Create the "${SUPABASE_UPLOAD_BUCKET}" storage bucket (run supabase/migrations/002_workspace_snapshot.sql). (${error.message})`,
    );
  }
  try {
    const text = await data.text();
    return normalizeDatabase(JSON.parse(text) as Partial<WorkspaceDatabase>);
  } catch {
    return emptyDatabase();
  }
}

async function writeStorageWorkspace(database: WorkspaceDatabase) {
  const supabase = getSupabaseAdmin();
  const body = Buffer.from(JSON.stringify(database), "utf8");
  const { error } = await supabase.storage.from(SUPABASE_UPLOAD_BUCKET).upload(WORKSPACE_OBJECT, body, {
    upsert: true,
    contentType: "application/json",
  });
  if (error) {
    throw new HttpError(
      503,
      `Supabase workspace could not be saved. (${error.message})`,
    );
  }
}

export async function readSupabaseDatabase(): Promise<WorkspaceDatabase> {
  return readStorageWorkspace();
}

export async function updateSupabaseDatabase(
  mutator: (database: WorkspaceDatabase) => void | Promise<void>,
): Promise<WorkspaceDatabase> {
  const database = await readStorageWorkspace();
  await mutator(database);
  await writeStorageWorkspace(database);
  return database;
}
