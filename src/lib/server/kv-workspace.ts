import { kv } from "@vercel/kv";
import { HttpError } from "./http";
import {
  KV_DATABASE_KEY,
  KV_LOCK_KEY,
  normalizeDatabase,
  type WorkspaceDatabase,
} from "./workspace-data";

const LOCK_TTL_SECONDS = 15;
const LOCK_WAIT_MS = 100;
const LOCK_ATTEMPTS = 40;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readKvUnlocked(): Promise<WorkspaceDatabase> {
  const stored = await kv.get<Partial<WorkspaceDatabase>>(KV_DATABASE_KEY);
  return normalizeDatabase(stored ?? undefined);
}

async function writeKvUnlocked(database: WorkspaceDatabase) {
  await kv.set(KV_DATABASE_KEY, database);
}

async function withKvLock<T>(task: () => Promise<T>): Promise<T> {
  const lockId = crypto.randomUUID();
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    const acquired = await kv.set(KV_LOCK_KEY, lockId, { nx: true, ex: LOCK_TTL_SECONDS });
    if (acquired) {
      try {
        return await task();
      } finally {
        const current = await kv.get<string>(KV_LOCK_KEY);
        if (current === lockId) {
          await kv.del(KV_LOCK_KEY);
        }
      }
    }
    await sleep(LOCK_WAIT_MS);
  }
  throw new HttpError(503, "The shared workspace is busy. Wait a moment and try again.");
}

export function readKvDatabase(): Promise<WorkspaceDatabase> {
  return readKvUnlocked();
}

export function updateKvDatabase(
  mutator: (database: WorkspaceDatabase) => void | Promise<void>,
): Promise<WorkspaceDatabase> {
  return withKvLock(async () => {
    const database = await readKvUnlocked();
    await mutator(database);
    await writeKvUnlocked(database);
    return database;
  });
}
