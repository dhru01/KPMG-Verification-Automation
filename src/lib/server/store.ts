import { readKvDatabase, updateKvDatabase } from "./kv-workspace";
import { readLocalDatabase, updateLocalDatabase } from "./local-workspace";
import { assertWorkspacePersistence, kvWorkspaceEnabled } from "./workspace-mode";
import type { WorkspaceDatabase } from "./workspace-data";

export type { WorkspaceDatabase };

export function readDatabase(): Promise<WorkspaceDatabase> {
  assertWorkspacePersistence();
  return kvWorkspaceEnabled() ? readKvDatabase() : readLocalDatabase();
}

export function updateDatabase(
  mutator: (database: WorkspaceDatabase) => void | Promise<void>,
): Promise<WorkspaceDatabase> {
  assertWorkspacePersistence();
  return kvWorkspaceEnabled() ? updateKvDatabase(mutator) : updateLocalDatabase(mutator);
}

export { saveUpload, readUpload, removeUpload, deleteRunUploadFolder, uploadsRoot } from "./uploads";
