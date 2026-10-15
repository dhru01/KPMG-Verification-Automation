import { HttpError } from "./http";
import { getSupabaseAdmin } from "./supabase-admin";
import { SUPABASE_UPLOAD_BUCKET } from "./supabase-storage";
import { emptyDatabase, normalizeDatabase, type WorkspaceDatabase } from "./workspace-data";

const WORKSPACE_ID = "default";
const WORKSPACE_OBJECT = "_workspace/database.json";
const MAX_WRITE_ATTEMPTS = 16;

type WorkspaceSnapshot = {
  version: number;
  database: WorkspaceDatabase;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneDatabase(database: WorkspaceDatabase): WorkspaceDatabase {
  return normalizeDatabase(JSON.parse(JSON.stringify(database)) as Partial<WorkspaceDatabase>);
}

function isPermissionDenied(error: { message?: string; code?: string }): boolean {
  const message = (error.message ?? "").toLowerCase();
  return message.includes("permission denied") || error.code === "42501";
}

function storageNotFound(error: { message?: string }): boolean {
  const message = (error.message ?? "").toLowerCase();
  return message.includes("not found") || message.includes("object not found");
}

function parseStorageSnapshot(text: string): WorkspaceSnapshot {
  const parsed = JSON.parse(text) as
    | { version?: number; database?: Partial<WorkspaceDatabase> }
    | Partial<WorkspaceDatabase>;
  if (parsed && typeof parsed === "object" && "database" in parsed) {
    return {
      version: typeof parsed.version === "number" ? parsed.version : 0,
      database: normalizeDatabase(parsed.database),
    };
  }
  return { version: 0, database: normalizeDatabase(parsed as Partial<WorkspaceDatabase>) };
}

async function readTableSnapshot(): Promise<WorkspaceSnapshot> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_snapshots")
    .select("payload, version")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const empty = emptyDatabase();
    const { error: insertError } = await supabase.from("workspace_snapshots").insert({
      id: WORKSPACE_ID,
      payload: empty,
      version: 0,
    });
    if (insertError) throw insertError;
    return { version: 0, database: empty };
  }

  return {
    version: typeof data.version === "number" ? data.version : 0,
    database: normalizeDatabase(data.payload as Partial<WorkspaceDatabase>),
  };
}

async function writeTableSnapshot(expectedVersion: number, database: WorkspaceDatabase): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const nextVersion = expectedVersion + 1;
  const { data, error } = await supabase
    .from("workspace_snapshots")
    .update({
      payload: database,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", WORKSPACE_ID)
    .eq("version", expectedVersion)
    .select("version")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function readStorageSnapshot(): Promise<WorkspaceSnapshot> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(SUPABASE_UPLOAD_BUCKET).download(WORKSPACE_OBJECT);
  if (error) {
    if (storageNotFound(error)) return { version: 0, database: emptyDatabase() };
    throw new HttpError(
      503,
      `Supabase workspace could not be read. Create the "${SUPABASE_UPLOAD_BUCKET}" storage bucket (run supabase/migrations/002_workspace_snapshot.sql). (${error.message})`,
    );
  }
  try {
    const text = await data.text();
    return parseStorageSnapshot(text);
  } catch {
    throw new HttpError(503, "Supabase workspace file could not be parsed. Try again in a moment.");
  }
}

async function writeStorageSnapshot(snapshot: WorkspaceSnapshot) {
  const supabase = getSupabaseAdmin();
  const body = Buffer.from(JSON.stringify(snapshot), "utf8");
  const { error } = await supabase.storage.from(SUPABASE_UPLOAD_BUCKET).upload(WORKSPACE_OBJECT, body, {
    upsert: true,
    contentType: "application/json",
  });
  if (error) {
    throw new HttpError(503, `Supabase workspace could not be saved. (${error.message})`);
  }
}

async function readSnapshot(preferTable: boolean): Promise<{ snapshot: WorkspaceSnapshot; mode: "table" | "storage" }> {
  if (preferTable) {
    try {
      return { snapshot: await readTableSnapshot(), mode: "table" };
    } catch (error) {
      if (!isPermissionDenied(error as { message?: string; code?: string })) throw error;
    }
  }
  return { snapshot: await readStorageSnapshot(), mode: "storage" };
}

async function updateWithRetry(
  mutator: (database: WorkspaceDatabase) => void | Promise<void>,
): Promise<WorkspaceDatabase> {
  let preferTable = true;

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { snapshot: before, mode } = await readSnapshot(preferTable);
    const database = cloneDatabase(before.database);
    await mutator(database);

    if (mode === "table") {
      const saved = await writeTableSnapshot(before.version, database);
      if (saved) return database;
    } else {
      const next: WorkspaceSnapshot = { version: before.version + 1, database };
      await writeStorageSnapshot(next);
      const after = await readStorageSnapshot();
      if (after.version >= next.version) {
        return database;
      }
    }

    await sleep(25 + attempt * 15);
    preferTable = mode === "table";
  }

  throw new HttpError(503, "The shared workspace is busy. Wait a moment and try again.");
}

export async function readSupabaseDatabase(): Promise<WorkspaceDatabase> {
  const { snapshot } = await readSnapshot(true);
  return snapshot.database;
}

export async function updateSupabaseDatabase(
  mutator: (database: WorkspaceDatabase) => void | Promise<void>,
): Promise<WorkspaceDatabase> {
  return updateWithRetry(mutator);
}
