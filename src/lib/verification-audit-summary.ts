import { getOpcoConfiguration } from "@engine/methodologies/registry";
import type { VerificationRun } from "./types";

/** Demo display names for audit traceability. */
export const DEMO_VERIFIED_BY = "Dhrupal Mistry";
export const DEMO_REVIEWED_BY = "Tiasha Moodley";

export interface VerificationAuditSummaryRow {
  opcoName: string;
  reportingMonth: string;
  reportingYear: number;
  reportingPeriod: string;
  verifiedBy: string;
  verifiedAt: string | null;
  reviewedBy: string;
  reviewedAt: string | null;
  reviewerSignOff: "Approved" | "Pending review";
  verificationStatus: string;
  linesVerified: number;
  outcomeSummary: string;
  methodologyVersion: string;
  runId: string;
}

export interface VerificationAuditSummaryData {
  rows: VerificationAuditSummaryRow[];
  totalRuns: number;
  fullySignedOff: number;
}

function latestVerifiedRunPerOpcoPeriod(runs: VerificationRun[]): VerificationRun[] {
  const map = new Map<string, VerificationRun>();
  const ordered = [...runs]
    .filter((run) => run.results.length > 0)
    .sort((left, right) => (right.verifiedAt ?? right.createdAt).localeCompare(left.verifiedAt ?? left.createdAt));
  for (const run of ordered) {
    const key = `${run.opcoId}|${run.reportingYear}|${run.reportingMonth}`;
    if (!map.has(key)) map.set(key, run);
  }
  return [...map.values()].sort((left, right) =>
    (right.verifiedAt ?? right.createdAt).localeCompare(left.verifiedAt ?? left.createdAt),
  );
}

function summarizeOutcomes(results: VerificationRun["results"]): string {
  const parts = ["Verified", "Discrepancy", "Missing Evidence", "Manual Review"]
    .map((status) => {
      const count = results.filter((result) => result.automatedStatus === status).length;
      return count ? `${count} ${status.toLowerCase()}` : null;
    })
    .filter(Boolean);
  return parts.join(" · ") || `${results.length} line(s)`;
}

function latestReviewedAt(results: VerificationRun["results"]): string | null {
  const stamps = results.map((result) => result.reviewedAt).filter(Boolean) as string[];
  if (stamps.length === 0) return null;
  return stamps.sort((left, right) => right.localeCompare(left))[0];
}

export function buildVerificationAuditSummary(
  runs: VerificationRun[],
  options?: { reportingMonth?: string; reportingYear?: number },
): VerificationAuditSummaryData {
  let scoped = runs;
  if (options?.reportingMonth && options.reportingYear) {
    scoped = runs.filter(
      (run) => run.reportingMonth === options.reportingMonth && run.reportingYear === options.reportingYear,
    );
  }

  const rows = latestVerifiedRunPerOpcoPeriod(scoped).map((run) => {
    const fullyReviewed = run.results.every((result) => result.reviewerStatus === "Accepted");
    return {
      opcoName: getOpcoConfiguration(run.opcoId)?.name ?? run.opcoId,
      reportingMonth: run.reportingMonth,
      reportingYear: run.reportingYear,
      reportingPeriod: `${run.reportingMonth} ${run.reportingYear}`,
      verifiedBy: DEMO_VERIFIED_BY,
      verifiedAt: run.verifiedAt,
      reviewedBy: fullyReviewed ? DEMO_REVIEWED_BY : "—",
      reviewedAt: fullyReviewed ? latestReviewedAt(run.results) : null,
      reviewerSignOff: (fullyReviewed ? "Approved" : "Pending review") as VerificationAuditSummaryRow["reviewerSignOff"],
      verificationStatus: run.status,
      linesVerified: run.results.length,
      outcomeSummary: summarizeOutcomes(run.results),
      methodologyVersion: run.methodologyVersion,
      runId: run.id,
    };
  });

  return {
    rows,
    totalRuns: rows.length,
    fullySignedOff: rows.filter((row) => row.reviewerSignOff === "Approved").length,
  };
}
