import { HttpError } from "./http";
import { getSupabaseAdmin } from "./supabase-admin";
import { emptyDatabase, normalizeDatabase, type WorkspaceDatabase } from "./workspace-data";

const WORKSPACE_ID = "default";
const MAX_WRITE_ATTEMPTS = 8;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readRow(): Promise<{ payload: WorkspaceDatabase; version: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_snapshots")
    .select("payload, version")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();

  if (error) {
    throw new HttpError(
      503,
      `Supabase workspace could not be read. Run supabase/migrations/002_workspace_snapshot.sql in your project. (${error.message})`,
    );
  }

  if (!data) {
    const empty = emptyDatabase();
    const { error: insertError } = await supabase.from("workspace_snapshots").insert({
      id: WORKSPACE_ID,
      payload: empty,
      version: 0,
    });
    if (insertError) {
      throw new HttpError(503, `Supabase workspace could not be initialised. (${insertError.message})`);
    }
    return { payload: empty, version: 0 };
  }

  return {
    payload: normalizeDatabase(data.payload as Partial<WorkspaceDatabase>),
    version: typeof data.version === "number" ? data.version : 0,
  };
}

export async function readSupabaseDatabase(): Promise<WorkspaceDatabase> {
  const row = await readRow();
  return row.payload;
}

export async function updateSupabaseDatabase(
  mutator: (database: WorkspaceDatabase) => void | Promise<void>,
): Promise<WorkspaceDatabase> {
  const supabase = getSupabaseAdmin();

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { payload, version } = await readRow();
    await mutator(payload);

    const { data, error } = await supabase
      .from("workspace_snapshots")
      .update({
        payload,
        version: version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", WORKSPACE_ID)
      .eq("version", version)
      .select("version")
      .maybeSingle();

    if (error) {
      throw new HttpError(503, `Supabase workspace could not be saved. (${error.message})`);
    }
    if (data) {
      return payload;
    }
    await sleep(40 * (attempt + 1));
  }

  throw new HttpError(503, "The shared workspace is busy. Wait a moment and try again.");
}
