import { getOpcoConfiguration } from "@engine/methodologies/registry";
import type { AuditLogEntry } from "./types";

export interface AuditDisplayRow {
  id: string;
  timestamp: string;
  userName: string;
  activity: string;
  detail: string;
  runHref: string | null;
}

const VERIFICATION_ACTIONS = new Set([
  "Created verification run",
  "Ran pilot verification",
  "Recorded reviewer action",
  "Cleared verification results",
  "Cleared verification results (demo reset)",
  "Confirmed evidence review",
]);

function opcoLabel(opcoId: unknown): string {
  if (typeof opcoId !== "string") return "OPCO";
  return getOpcoConfiguration(opcoId)?.name ?? opcoId;
}

function reviewerVerb(action: unknown): string {
  if (action === "accept") return "Approved";
  if (action === "flag") return "Flagged for follow-up";
  if (action === "request_evidence") return "Requested additional evidence";
  if (action === "comment") return "Saved reviewer comment";
  return "Recorded reviewer action";
}

export function formatAuditEntry(entry: AuditLogEntry): AuditDisplayRow | null {
  if (!VERIFICATION_ACTIONS.has(entry.action) && entry.entityType !== "verification_result") {
    if (entry.entityType !== "verification_run") return null;
  }

  const details = entry.changeDetails;
  const period =
    typeof details.period === "string"
      ? details.period
      : typeof details.reportingPeriod === "string"
        ? details.reportingPeriod
        : null;

  switch (entry.action) {
    case "Created verification run":
      return {
        id: entry.id,
        timestamp: entry.timestamp,
        userName: entry.userName,
        activity: "Started verification run",
        detail: `${opcoLabel(details.opcoId)} · ${period ?? "Reporting period"} · ${details.scope ?? "Scope"}`,
        runHref: `/verification/new?run=${entry.entityId}`,
      };
    case "Ran pilot verification":
      return {
        id: entry.id,
        timestamp: entry.timestamp,
        userName: entry.userName,
        activity: "Ran automated verification",
        detail: `${opcoLabel(details.opcoId)} · ${period ?? "Reporting period"} · ${details.results ?? 0} line(s) · methodology ${details.methodologyVersion ?? "—"}`,
        runHref: `/verification/${entry.entityId}`,
      };
    case "Recorded reviewer action":
      return {
        id: entry.id,
        timestamp: entry.timestamp,
        userName: entry.userName,
        activity: reviewerVerb(details.action),
        detail: [
          typeof details.facilityName === "string" ? details.facilityName : "Verification line",
          typeof details.category === "string" ? details.category : null,
          period,
          typeof details.automatedStatus === "string" ? `automated: ${details.automatedStatus}` : null,
          typeof details.reviewerStatus === "string" ? `decision: ${details.reviewerStatus}` : null,
          typeof details.comment === "string" && details.comment ? `comment: ${details.comment}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        runHref: typeof details.runId === "string" ? `/verification/${details.runId}` : null,
      };
    case "Cleared verification results":
    case "Cleared verification results (demo reset)":
      return {
        id: entry.id,
        timestamp: entry.timestamp,
        userName: entry.userName,
        activity: "Cleared verification results",
        detail: period ? `Reporting period ${period}` : "Verification results removed from run",
        runHref: `/verification/new?run=${entry.entityId}&step=4`,
      };
    case "Confirmed evidence review":
      return {
        id: entry.id,
        timestamp: entry.timestamp,
        userName: entry.userName,
        activity: "Confirmed evidence for verification",
        detail: period ? `${opcoLabel(details.opcoId)} · ${period}` : "Evidence ready to verify",
        runHref: `/verification/new?run=${entry.entityId}&step=4`,
      };
    default:
      if (entry.entityType === "verification_run" || entry.entityType === "verification_result") {
        return {
          id: entry.id,
          timestamp: entry.timestamp,
          userName: entry.userName,
          activity: entry.action,
          detail: entry.entityType,
          runHref: entry.entityType === "verification_run" ? `/verification/${entry.entityId}` : null,
        };
      }
      return null;
  }
}

export function verificationAuditRows(entries: AuditLogEntry[]): AuditDisplayRow[] {
  return entries
    .map(formatAuditEntry)
    .filter((row): row is AuditDisplayRow => row !== null);
}
