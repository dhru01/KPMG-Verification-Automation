import { readKvDatabase, updateKvDatabase } from "./kv-workspace";
import { readLocalDatabase, updateLocalDatabase } from "./local-workspace";
import { readSupabaseDatabase, updateSupabaseDatabase } from "./supabase-workspace";
import { assertWorkspacePersistence, kvWorkspaceEnabled, supabaseWorkspaceEnabled } from "./workspace-mode";
import type { WorkspaceDatabase } from "./workspace-data";

export type { WorkspaceDatabase };

function readActiveDatabase(): Promise<WorkspaceDatabase> {
  if (kvWorkspaceEnabled()) return readKvDatabase();
  if (supabaseWorkspaceEnabled()) return readSupabaseDatabase();
  return readLocalDatabase();
}

function updateActiveDatabase(
  mutator: (database: WorkspaceDatabase) => void | Promise<void>,
): Promise<WorkspaceDatabase> {
  if (kvWorkspaceEnabled()) return updateKvDatabase(mutator);
  if (supabaseWorkspaceEnabled()) return updateSupabaseDatabase(mutator);
  return updateLocalDatabase(mutator);
}

export function readDatabase(): Promise<WorkspaceDatabase> {
  assertWorkspacePersistence();
  return readActiveDatabase();
}

export function updateDatabase(
  mutator: (database: WorkspaceDatabase) => void | Promise<void>,
): Promise<WorkspaceDatabase> {
  assertWorkspacePersistence();
  return updateActiveDatabase(mutator);
}

export { saveUpload, readUpload, removeUpload, deleteRunUploadFolder, uploadsRoot } from "./uploads";
