import { del, list, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { HttpError } from "./http";
import {
  deleteSupabaseRunFolder,
  downloadFromSupabase,
  removeFromSupabase,
  uploadToSupabase,
} from "./supabase-storage";
import { blobUploadsEnabled, kvWorkspaceEnabled, supabaseWorkspaceEnabled } from "./workspace-mode";
import { localUploadsRoot } from "./local-workspace";

function blobPrefix(runId: string) {
  return `ghg-hub/${runId}/`;
}

function isBlobStoragePath(storagePath: string): boolean {
  return storagePath.startsWith("https://");
}

function isSupabaseStoragePath(storagePath: string): boolean {
  return storagePath.startsWith("supabase://");
}

export async function saveUpload(runId: string, storedName: string, bytes: Buffer): Promise<string> {
  if (blobUploadsEnabled()) {
    const result = await put(`${blobPrefix(runId)}${storedName}`, bytes, {
      access: "public",
      addRandomSuffix: false,
    });
    return result.url;
  }
  if (supabaseWorkspaceEnabled()) {
    return uploadToSupabase(runId, storedName, bytes);
  }
  if (kvWorkspaceEnabled()) {
    throw new HttpError(
      503,
      "File storage is not configured. Connect Vercel Blob to this project and redeploy (see README: Deploy on Vercel).",
    );
  }
  const directory = path.join(localUploadsRoot(), runId);
  await mkdir(directory, { recursive: true });
  const fullPath = path.join(directory, storedName);
  await writeFile(fullPath, bytes);
  return path.relative(process.cwd(), fullPath);
}

export async function readUpload(storagePath: string): Promise<Buffer> {
  if (isSupabaseStoragePath(storagePath)) {
    return downloadFromSupabase(storagePath);
  }
  if (isBlobStoragePath(storagePath)) {
    const response = await fetch(storagePath);
    if (!response.ok) {
      throw new HttpError(404, "Uploaded file could not be retrieved.");
    }
    return Buffer.from(await response.arrayBuffer());
  }
  const root = localUploadsRoot();
  const fullPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), storagePath);
  if (!fullPath.startsWith(root + path.sep)) {
    throw new Error("Invalid file path.");
  }
  return readFile(fullPath);
}

export async function removeUpload(storagePath: string) {
  if (isSupabaseStoragePath(storagePath)) {
    await removeFromSupabase(storagePath);
    return;
  }
  if (isBlobStoragePath(storagePath)) {
    await del(storagePath);
    return;
  }
  const root = localUploadsRoot();
  const fullPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), storagePath);
  if (!fullPath.startsWith(root + path.sep)) return;
  const { rm } = await import("fs/promises");
  await rm(fullPath, { force: true });
}

export async function deleteRunUploadFolder(runId: string) {
  if (blobUploadsEnabled()) {
    const prefix = blobPrefix(runId);
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 100 });
      await Promise.all(page.blobs.map((blob) => del(blob.url)));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return;
  }
  if (supabaseWorkspaceEnabled()) {
    await deleteSupabaseRunFolder(runId);
    return;
  }
  if (kvWorkspaceEnabled()) return;
  const { rm } = await import("fs/promises");
  await rm(path.join(localUploadsRoot(), runId), { recursive: true, force: true });
}

/** @deprecated Use localUploadsRoot from local-workspace only for local disk checks. */
export function uploadsRoot(): string {
  return localUploadsRoot();
}
