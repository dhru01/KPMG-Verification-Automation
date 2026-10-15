import { getOpcoConfiguration } from "@engine/methodologies/registry";
import { deriveRunStatus } from "./records";
import type { VerificationRun } from "./types";

export interface CategorySummary {
  total: number;
  verified: number;
  discrepancies: number;
  pendingReview: number;
  missingEvidence: number;
  reviewerApproved: number;
  reviewerPending: number;
}

export interface DashboardAttentionItem {
  runId: string;
  opco: string;
  resultId: string;
  facilityName: string;
  category: string;
  automatedStatus: string;
  reviewerStatus: string | null;
  reason: string;
}

export interface DashboardActivity {
  opco: string;
  reportingMonth: string;
  scope: string;
  records: number;
  status: string;
  reviewerDecision: string;
  runId?: string;
}

export interface DashboardData {
  source: "records" | "demonstration";
  note: string | null;
  total: number;
  verified: number;
  discrepancies: number;
  pendingReview: number;
  missingEvidence: number;
  processingErrors: number;
  progress: number;
  opcosApproved: number;
  opcosTotal: number;
  categories: Record<string, CategorySummary>;
  activity: DashboardActivity[];
  latestPeriod: string;
  activeOpco: string;
  primaryRunId: string | null;
  reviewerApproved: number;
  reviewerPending: number;
  attentionItems: DashboardAttentionItem[];
}

/** Portfolio size used for the dashboard progress bar (each approved OPCO adds 5%). */
export const PORTFOLIO_OPCO_COUNT = 20;

const CATEGORIES = [
  "Stationary Combustion",
  "Mobile Combustion",
  "Fugitive Emissions",
  "Purchased Electricity",
];

export const DEMONSTRATION_DASHBOARD: DashboardData = {
  source: "demonstration",
  note: "These figures are illustrative and are shown until a verification run is processed from uploaded files.",
  total: 75,
  verified: 48,
  discrepancies: 9,
  pendingReview: 11,
  missingEvidence: 7,
  processingErrors: 0,
  progress: 0,
  opcosApproved: 0,
  opcosTotal: PORTFOLIO_OPCO_COUNT,
  categories: {
    "Stationary Combustion": { total: 18, verified: 12, discrepancies: 2, pendingReview: 2, missingEvidence: 2, reviewerApproved: 10, reviewerPending: 8 },
    "Mobile Combustion": { total: 15, verified: 10, discrepancies: 2, pendingReview: 2, missingEvidence: 1, reviewerApproved: 8, reviewerPending: 7 },
    "Fugitive Emissions": { total: 12, verified: 7, discrepancies: 2, pendingReview: 2, missingEvidence: 1, reviewerApproved: 6, reviewerPending: 6 },
    "Purchased Electricity": { total: 30, verified: 19, discrepancies: 3, pendingReview: 5, missingEvidence: 3, reviewerApproved: 20, reviewerPending: 10 },
  },
  activity: [
    { opco: "Ayoba", reportingMonth: "September 2026", scope: "Scope 1", records: 45, status: "In Progress", reviewerDecision: "Pending review" },
    { opco: "Ayoba", reportingMonth: "September 2026", scope: "Scope 2", records: 30, status: "Completed", reviewerDecision: "Approved" },
  ],
  latestPeriod: "Not selected",
  activeOpco: "Ayoba",
  primaryRunId: null,
  reviewerApproved: 0,
  reviewerPending: 0,
  attentionItems: [],
};

function emptyCategory(): CategorySummary {
  return {
    total: 0,
    verified: 0,
    discrepancies: 0,
    pendingReview: 0,
    missingEvidence: 0,
    reviewerApproved: 0,
    reviewerPending: 0,
  };
}

function opcoName(opcoId: string): string {
  return getOpcoConfiguration(opcoId)?.name ?? opcoId;
}

function isOpcoReviewerApproved(run: VerificationRun): boolean {
  return run.results.length > 0 && run.results.every((result) => result.reviewerStatus === "Accepted");
}

function attentionReason(automatedStatus: string): string {
  if (automatedStatus === "Missing Evidence") return "Upload or match supporting evidence.";
  if (automatedStatus === "Discrepancy") return "Review the variance and record a reviewer decision.";
  if (automatedStatus === "Manual Review") return "Complete manual review before sign-off.";
  if (automatedStatus === "Processing Error") return "Resolve the processing error, then re-run verification.";
  return "Record accept, flag, or evidence request on the results screen.";
}

function attentionItemsForRuns(runs: Iterable<VerificationRun>): DashboardAttentionItem[] {
  const items: DashboardAttentionItem[] = [];
  for (const run of runs) {
    for (const result of run.results) {
      if (result.reviewerStatus === "Accepted") continue;
      items.push({
        runId: run.id,
        opco: opcoName(run.opcoId),
        resultId: result.id,
        facilityName: result.facilityName,
        category: result.category,
        automatedStatus: result.automatedStatus,
        reviewerStatus: result.reviewerStatus,
        reason: attentionReason(result.automatedStatus),
      });
    }
  }
  return items.sort((left, right) => left.facilityName.localeCompare(right.facilityName));
}

function portfolioProgress(runs: Iterable<VerificationRun>) {
  let opcosApproved = 0;
  for (const run of runs) {
    if (isOpcoReviewerApproved(run)) opcosApproved += 1;
  }
  return {
    opcosApproved,
    opcosTotal: PORTFOLIO_OPCO_COUNT,
    progress: Math.round((opcosApproved / PORTFOLIO_OPCO_COUNT) * 100),
  };
}

function scopeVerificationStatus(run: VerificationRun, scope: string): string {
  const results = run.results.filter((result) => result.scope === scope);
  if (results.length === 0) {
    return run.results.length === 0 ? deriveRunStatus(run) : "In Progress";
  }
  const resolved = results.every(
    (result) => result.automatedStatus === "Verified" || result.reviewerStatus === "Accepted",
  );
  return resolved ? "Completed" : "Pending Review";
}

function scopeReviewerDecision(run: VerificationRun, scope: string): string {
  const results = run.results.filter((result) => result.scope === scope);
  if (results.length === 0) return "—";
  if (results.every((result) => result.reviewerStatus === "Accepted")) return "Approved";
  return "Pending review";
}

function activityRowsForRun(run: VerificationRun): DashboardActivity[] {
  const scopes = run.scopeSelection === "Both" ? ["Scope 1", "Scope 2"] : [run.scopeSelection];
  return scopes.flatMap((scope) => {
    const consumptionCount = run.consumptionRecords.filter((record) => record.scope === scope).length;
    const scopeResults = run.results.filter((result) => result.scope === scope);
    const resultCount = scopeResults.length;
    if (consumptionCount === 0 && resultCount === 0) return [];
    const records = consumptionCount > 0 ? consumptionCount : resultCount;
    return {
      opco: opcoName(run.opcoId),
      reportingMonth: `${run.reportingMonth} ${run.reportingYear}`,
      scope,
      records,
      status: scopeVerificationStatus(run, scope),
      reviewerDecision: scopeReviewerDecision(run, scope),
      runId: run.id,
    };
  });
}

/** Newest run per OPCO + reporting period (avoids duplicate activity rows from re-runs). */
function latestRunsForActivity(runs: VerificationRun[], limit: number): VerificationRun[] {
  const newestByPeriod = new Map<string, VerificationRun>();
  const ordered = [...runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  for (const run of ordered) {
    const key = `${run.opcoId}|${run.reportingYear}|${run.reportingMonth}`;
    if (!newestByPeriod.has(key)) newestByPeriod.set(key, run);
  }
  return [...newestByPeriod.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export function parsePeriodLabel(label: string): { month: string; year: number } | null {
  const match = label.trim().match(/^(.+)\s+(\d{4})$/);
  if (!match) return null;
  return { month: match[1].trim(), year: Number(match[2]) };
}

function emptyDashboard(month: string, year: number, activeOpco: string): DashboardData {
  return {
    source: "records",
    note: null,
    total: 0,
    verified: 0,
    discrepancies: 0,
    pendingReview: 0,
    missingEvidence: 0,
    processingErrors: 0,
    progress: 0,
    categories: Object.fromEntries(CATEGORIES.map((category) => [category, emptyCategory()])),
    activity: [],
    latestPeriod: `${month} ${year}`,
    activeOpco,
    primaryRunId: null,
    reviewerApproved: 0,
    reviewerPending: 0,
    opcosApproved: 0,
    opcosTotal: PORTFOLIO_OPCO_COUNT,
    attentionItems: [],
  };
}

export function buildDashboard(
  runs: VerificationRun[],
  options?: { reportingMonth?: string; reportingYear?: number },
): DashboardData {
  const scoped =
    options?.reportingMonth && options.reportingYear
      ? runs.filter(
          (run) => run.reportingMonth === options.reportingMonth && run.reportingYear === options.reportingYear,
        )
      : runs;
  const ordered = [...scoped].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latestPeriod = ordered[0]
    ? `${ordered[0].reportingMonth} ${ordered[0].reportingYear}`
    : options?.reportingMonth && options.reportingYear
      ? `${options.reportingMonth} ${options.reportingYear}`
      : "Not selected";
  const activeOpco = ordered[0] ? opcoName(ordered[0].opcoId) : "Ayoba";
  const withResults = ordered.filter((run) => run.results.length > 0);
  if (withResults.length === 0) {
    if (options?.reportingMonth && options.reportingYear) {
      const activityRuns = latestRunsForActivity(ordered, 1);
      const activity = activityRuns.flatMap(activityRowsForRun);
      const inProgressRuns = activityRuns.length > 0 ? activityRuns : ordered.slice(0, 1);
      return {
        ...emptyDashboard(options.reportingMonth, options.reportingYear, activeOpco),
        activity,
        primaryRunId: activityRuns[0]?.id ?? ordered[0]?.id ?? null,
        attentionItems: attentionItemsForRuns(inProgressRuns),
      };
    }
    return { ...DEMONSTRATION_DASHBOARD, latestPeriod, activity: DEMONSTRATION_DASHBOARD.activity };
  }

  const latestByPeriod = new Map<string, VerificationRun>();
  for (const run of withResults) {
    const key = `${run.opcoId}|${run.reportingYear}|${run.reportingMonth}`;
    const existing = latestByPeriod.get(key);
    if (!existing || existing.createdAt < run.createdAt) latestByPeriod.set(key, run);
  }

  const categories = Object.fromEntries(CATEGORIES.map((category) => [category, emptyCategory()]));
  let verified = 0;
  let discrepancies = 0;
  let pendingReview = 0;
  let missingEvidence = 0;
  let processingErrors = 0;
  let total = 0;
  let reviewerApproved = 0;
  let reviewerPending = 0;

  for (const run of latestByPeriod.values()) {
    for (const result of run.results) {
      total += 1;
      const bucket = categories[result.category] ?? emptyCategory();
      categories[result.category] = bucket;
      bucket.total += 1;
      if (result.automatedStatus === "Verified") {
        verified += 1;
        bucket.verified += 1;
      } else if (result.automatedStatus === "Discrepancy") {
        discrepancies += 1;
        bucket.discrepancies += 1;
      } else if (result.automatedStatus === "Missing Evidence") {
        missingEvidence += 1;
        bucket.missingEvidence += 1;
      } else if (result.automatedStatus === "Manual Review") {
        // Awaiting reviewer; counted in pendingReview below.
      } else if (result.automatedStatus === "Processing Error") {
        processingErrors += 1;
      }
      if (result.reviewerStatus === "Accepted") {
        reviewerApproved += 1;
        bucket.reviewerApproved += 1;
      } else {
        reviewerPending += 1;
        bucket.reviewerPending += 1;
        pendingReview += 1;
        bucket.pendingReview += 1;
      }
    }
  }

  const activityLimit = options?.reportingMonth && options.reportingYear ? 1 : 3;
  const activityRuns = latestRunsForActivity(scoped, activityLimit);
  const activity = activityRuns.flatMap(activityRowsForRun);
  const primaryRun =
    activityRuns[0] ?? ordered.find((run) => run.results.length > 0) ?? ordered[0] ?? null;
  const portfolio = portfolioProgress(latestByPeriod.values());

  return {
    source: "records",
    note: "Counts are calculated from the latest verification run for each operating company and reporting period. Pilot results are not an approved methodology.",
    total,
    verified,
    discrepancies,
    pendingReview,
    missingEvidence,
    processingErrors,
    progress: portfolio.progress,
    opcosApproved: portfolio.opcosApproved,
    opcosTotal: portfolio.opcosTotal,
    categories,
    activity,
    latestPeriod,
    activeOpco: opcoName(ordered[0].opcoId),
    primaryRunId: primaryRun?.id ?? null,
    reviewerApproved,
    reviewerPending,
    attentionItems: attentionItemsForRuns(latestByPeriod.values()),
  };
}
