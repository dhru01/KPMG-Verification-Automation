import type { NextRequest } from "next/server";
import type { Role, SessionUser } from "../types";
import { fileExtension } from "../utils";
import { workspaceUser } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function requireUser(_request: NextRequest): SessionUser {
  return workspaceUser;
}

export function requireRole(user: SessionUser, roles: Role[]) {
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "You do not have permission to perform this action.");
  }
}

export function handleError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Something went wrong while processing the request." }, { status: 500 });
}

export async function readFormFile(request: NextRequest, allowed: string[]) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
  const extension = fileExtension(file.name);
  if (!allowed.includes(extension)) {
    throw new HttpError(400, `This step accepts ${allowed.join(", ")} files.`);
  }
  if (file.size === 0) throw new HttpError(400, "The file is empty.");
  if (file.size > 20 * 1024 * 1024) throw new HttpError(400, "Files must be 20 MB or smaller.");
  return { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) };
}
