import { DEFAULT_TOLERANCE } from "@engine/shared/types";
import type { AppNotification, AppSettings, AuditLogEntry, VerificationRun } from "../types";

export interface WorkspaceDatabase {
  runs: VerificationRun[];
  auditLogs: AuditLogEntry[];
  notifications: AppNotification[];
  settings: AppSettings;
}

export function emptyDatabase(): WorkspaceDatabase {
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

export function normalizeDatabase(parsed: Partial<WorkspaceDatabase> | undefined): WorkspaceDatabase {
  const empty = emptyDatabase();
  if (!parsed || typeof parsed !== "object") return empty;
  return {
    runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    settings: {
      ...empty.settings,
      ...(parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {}),
      opcoRegions: {
        ...empty.settings.opcoRegions,
        ...(parsed.settings?.opcoRegions && typeof parsed.settings.opcoRegions === "object"
          ? parsed.settings.opcoRegions
          : {}),
      },
    },
  };
}

export const KV_DATABASE_KEY = "ghg-hub:database";
export const KV_LOCK_KEY = "ghg-hub:lock";
