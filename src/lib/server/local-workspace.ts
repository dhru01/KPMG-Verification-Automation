import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { HttpError } from "./http";
import { emptyDatabase, normalizeDatabase, type WorkspaceDatabase } from "./workspace-data";

const dataDir = path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "store.json");

let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function persistenceError(error: unknown): HttpError {
  const code = error && typeof error === "object" && "code" in error ? String((error as NodeJS.ErrnoException).code) : "";
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return new HttpError(
      503,
      "Could not save verification data. Ensure the project data folder exists and is writable (see README: Data storage).",
    );
  }
  if (code === "ENOSPC") {
    return new HttpError(503, "Could not save verification data. The disk is full.");
  }
  return new HttpError(503, "Could not save verification data. Run the app from the project root and try again.");
}

async function readUnlocked(): Promise<WorkspaceDatabase> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceDatabase>;
    return normalizeDatabase(parsed);
  } catch {
    return emptyDatabase();
  }
}

async function writeUnlocked(database: WorkspaceDatabase) {
  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(storePath, JSON.stringify(database));
  } catch (error) {
    throw persistenceError(error);
  }
}

export function readLocalDatabase(): Promise<WorkspaceDatabase> {
  return withLock(readUnlocked);
}

export function updateLocalDatabase(
  mutator: (database: WorkspaceDatabase) => void | Promise<void>,
): Promise<WorkspaceDatabase> {
  return withLock(async () => {
    const database = await readUnlocked();
    await mutator(database);
    await writeUnlocked(database);
    return database;
  });
}

export function localUploadsRoot(): string {
  return path.join(dataDir, "uploads");
}
