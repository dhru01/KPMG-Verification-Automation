import { listOpcoConfigurations } from "@engine/methodologies/registry";
import { PORTFOLIO_OPCO_COUNT } from "./dashboard";
import type { VerificationRun } from "./types";

export interface OpcoLiveRow {
  opcoId: string;
  opcoName: string;
  runId: string | null;
  records: number;
  resultsSummary: string;
  hasVerificationResults: boolean;
  verificationStatus: string;
  reviewerDecision: string;
  reviewerName: string | null;
  lastUpdated: string | null;
  methodologyVersion: string | null;
  isDemonstration: boolean;
}

export interface VerificationLiveData {
  reportingMonth: string;
  reportingYear: number;
  rows: OpcoLiveRow[];
  opcosApproved: number;
  opcosTotal: number;
  progress: number;
}

function latestRunPerOpco(runs: VerificationRun[]): Map<string, VerificationRun> {
  const map = new Map<string, VerificationRun>();
  const ordered = [...runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  for (const run of ordered) {
    if (!map.has(run.opcoId)) map.set(run.opcoId, run);
  }
  return map;
}

function summarizeResults(results: VerificationRun["results"]): string {
  if (results.length === 0) return "Verification not run";
  const parts = ["Verified", "Discrepancy", "Missing Evidence", "Manual Review", "Processing Error"]
    .map((status) => {
      const count = results.filter((result) => result.automatedStatus === status).length;
      return count ? `${count} ${status.toLowerCase()}` : null;
    })
    .filter(Boolean);
  return parts.join(" · ") || `${results.length} line${results.length === 1 ? "" : "s"}`;
}

function reviewerDecisionForRun(run: VerificationRun | undefined): string {
  if (!run || run.results.length === 0) return "—";
  return run.results.every((result) => result.reviewerStatus === "Accepted") ? "Approved" : "Pending review";
}

export function buildVerificationLiveView(
  runs: VerificationRun[],
  reportingMonth: string,
  reportingYear: number,
): VerificationLiveData {
  const scoped = runs.filter(
    (run) => run.reportingMonth === reportingMonth && run.reportingYear === reportingYear,
  );
  const latestByOpco = latestRunPerOpco(scoped);
  const configured = listOpcoConfigurations().filter((opco) => opco.isActive);

  const rows: OpcoLiveRow[] = configured.map((opco) => {
    const run = latestByOpco.get(opco.id);
    return {
      opcoId: opco.id,
      opcoName: opco.name,
      runId: run?.id ?? null,
      records: run?.consumptionRecords.length ?? 0,
      resultsSummary: run ? summarizeResults(run.results) : "No submission",
      hasVerificationResults: (run?.results.length ?? 0) > 0,
      verificationStatus: run ? run.status : "Not started",
      reviewerDecision: reviewerDecisionForRun(run),
      reviewerName: run?.reviewerName ?? null,
      lastUpdated: run ? run.verifiedAt ?? run.createdAt : null,
      methodologyVersion: run?.methodologyVersion ?? null,
      isDemonstration: run?.isDemonstration ?? false,
    };
  });

  const opcosApproved = rows.filter((row) => row.reviewerDecision === "Approved").length;

  return {
    reportingMonth,
    reportingYear,
    rows,
    opcosApproved,
    opcosTotal: PORTFOLIO_OPCO_COUNT,
    progress: Math.round((opcosApproved / PORTFOLIO_OPCO_COUNT) * 100),
  };
}
