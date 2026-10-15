import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { DEFAULT_TOLERANCE } from "@engine/shared/types";
import type { AppNotification, AppSettings, AuditLogEntry, VerificationRun } from "../types";
import { HttpError } from "./http";

interface Database {
  runs: VerificationRun[];
  auditLogs: AuditLogEntry[];
  notifications: AppNotification[];
  settings: AppSettings;
}

function emptyDatabase(): Database {
  return {
    runs: [],
    auditLogs: [],
    notifications: [],
    settings: {
      tolerance: DEFAULT_TOLERANCE,
      opcoRegions: { ayoba: "South Africa" },
    },
  };
}

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

async function readUnlocked(): Promise<Database> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<Database>;
    return {
      ...emptyDatabase(),
      ...parsed,
      settings: { ...emptyDatabase().settings, ...parsed.settings },
    };
  } catch {
    return emptyDatabase();
  }
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

async function writeUnlocked(database: Database) {
  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(storePath, JSON.stringify(database));
  } catch (error) {
    throw persistenceError(error);
  }
}

export function readDatabase(): Promise<Database> {
  return withLock(readUnlocked);
}

export function updateDatabase(mutator: (database: Database) => void | Promise<void>): Promise<Database> {
  return withLock(async () => {
    const database = await readUnlocked();
    await mutator(database);
    await writeUnlocked(database);
    return database;
  });
}

export function uploadsRoot(): string {
  return path.join(dataDir, "uploads");
}

export async function saveUpload(runId: string, storedName: string, bytes: Buffer): Promise<string> {
  const directory = path.join(uploadsRoot(), runId);
  await mkdir(directory, { recursive: true });
  const fullPath = path.join(directory, storedName);
  await writeFile(fullPath, bytes);
  return path.relative(process.cwd(), fullPath);
}

export async function readUpload(relativePath: string): Promise<Buffer> {
  const root = uploadsRoot();
  const fullPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), relativePath);
  if (!fullPath.startsWith(root + path.sep)) {
    throw new Error("Invalid file path.");
  }
  return readFile(fullPath);
}

export async function removeUpload(relativePath: string) {
  const root = uploadsRoot();
  const fullPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), relativePath);
  if (!fullPath.startsWith(root + path.sep)) return;
  const { rm } = await import("fs/promises");
  await rm(fullPath, { force: true });
}
