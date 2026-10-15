import { formatPercent, formatQuantity, quantityWithUnit } from "../shared/display";
import type { ToleranceConfig } from "../shared/types";

/** Ignores binary floating-point noise. This is not a business tolerance. */
export const NUMERIC_EPSILON = 1e-6;

export interface DifferenceResult {
  reportedConsumption: number;
  evidenceConsumption: number;
  difference: number;
  absoluteDifference: number;
  percentageDifference: number | null;
  zeroValueRuleApplied: boolean;
  percentageUndefinedReason: string | null;
}

export type ComparisonDecision = "verified" | "discrepancy" | "manual_review";

export function valuesMatchExactly(left: number, right: number): boolean {
  return Math.abs(left - right) <= NUMERIC_EPSILON;
}

export function calculateDifference(reported: number, evidence: number): DifferenceResult {
  const difference = reported - evidence;
  const absoluteDifference = Math.abs(difference);
  const evidenceIsZero = Math.abs(evidence) <= NUMERIC_EPSILON;

  if (evidenceIsZero) {
    return {
      reportedConsumption: reported,
      evidenceConsumption: evidence,
      difference,
      absoluteDifference,
      percentageDifference: null,
      zeroValueRuleApplied: true,
      percentageUndefinedReason:
        "Evidence consumption is zero, so the percentage difference is undefined.",
    };
  }

  return {
    reportedConsumption: reported,
    evidenceConsumption: evidence,
    difference,
    absoluteDifference,
    percentageDifference: (absoluteDifference / Math.abs(evidence)) * 100,
    zeroValueRuleApplied: false,
    percentageUndefinedReason: null,
  };
}

export function decideComparison(
  result: DifferenceResult,
  tolerance: ToleranceConfig,
): { decision: ComparisonDecision; reason: string } {
  if (result.zeroValueRuleApplied) {
    if (valuesMatchExactly(result.reportedConsumption, 0)) {
      return {
        decision: "verified",
        reason: "Both reported consumption and supporting evidence are zero.",
      };
    }
    return {
      decision: "manual_review",
      reason:
        "Zero-value comparison rule: evidence consumption is zero and reported consumption is not. The percentage difference is undefined, so this record is flagged for review.",
    };
  }

  if (tolerance.mode === "exact") {
    const pass = valuesMatchExactly(result.difference, 0);
    return pass
      ? { decision: "verified", reason: "Reported consumption matches the supporting evidence exactly." }
      : {
          decision: "discrepancy",
          reason: `The absolute difference of ${formatQuantity(result.absoluteDifference)} is outside the exact-match tolerance.`,
        };
  }

  if (tolerance.mode === "absolute") {
    const limit = tolerance.absoluteTolerance ?? 0;
    const pass = result.absoluteDifference <= limit + NUMERIC_EPSILON;
    return pass
      ? {
          decision: "verified",
          reason: `The absolute difference of ${formatQuantity(result.absoluteDifference)} is within the configured absolute tolerance of ${formatQuantity(limit)}.`,
        }
      : {
          decision: "discrepancy",
          reason: `The absolute difference of ${formatQuantity(result.absoluteDifference)} exceeds the configured absolute tolerance of ${formatQuantity(limit)}.`,
        };
  }

  const limit = tolerance.percentageTolerance ?? 0;
  const percentage = result.percentageDifference ?? Number.POSITIVE_INFINITY;
  const pass = percentage <= limit + NUMERIC_EPSILON;
  return pass
    ? {
        decision: "verified",
        reason: `The percentage difference of ${formatPercent(percentage)} is within the configured percentage tolerance of ${formatPercent(limit)}.`,
      }
    : {
        decision: "discrepancy",
        reason: `The percentage difference of ${formatPercent(percentage)} exceeds the configured percentage tolerance of ${formatPercent(limit)}.`,
      };
}

export function buildCalculationSteps(
  result: DifferenceResult,
  unit: string,
  evidenceLabel = "Supporting evidence",
): string[] {
  const reported = formatQuantity(result.reportedConsumption);
  const evidence = formatQuantity(result.evidenceConsumption);
  const difference = formatQuantity(result.difference);
  const steps = [
    `Reported consumption: ${reported} ${unit}`,
    `${evidenceLabel}: ${evidence} ${unit}`,
    `Difference: ${reported} − ${evidence} = ${difference} ${unit}`,
  ];

  if (result.percentageDifference === null) {
    steps.push("Percentage difference: not calculated, because evidence consumption is zero.");
  } else {
    steps.push(
      `Percentage difference: (${formatQuantity(result.absoluteDifference)} / ${formatQuantity(Math.abs(result.evidenceConsumption))}) × 100 = ${formatPercent(result.percentageDifference)}`,
    );
  }

  return steps;
}

export function buildConclusion(input: {
  consumptionType: string;
  unit: string;
  reported: number;
  evidence: number | null;
  absoluteDifference: number | null;
  percentageDifference: number | null;
  decision: ComparisonDecision;
  zeroValueRuleApplied: boolean;
}): string {
  const type = input.consumptionType.trim() || "consumption";
  if (input.evidence === null || input.absoluteDifference === null) {
    return `Reported ${type} consumption could not be compared with supporting evidence.`;
  }

  if (input.decision === "manual_review" && input.zeroValueRuleApplied) {
    return `Reported ${type} consumption is ${quantityWithUnit(input.reported, input.unit)}, while supporting evidence is zero. The percentage difference is undefined and needs review.`;
  }

  if (valuesMatchExactly(input.absoluteDifference, 0)) {
    return `Reported ${type} consumption matches the supporting evidence of ${quantityWithUnit(input.evidence, input.unit)}.`;
  }

  const direction = input.reported > input.evidence ? "exceeds" : "is below";
  const percent =
    input.percentageDifference === null
      ? ""
      : `, representing a ${formatPercent(input.percentageDifference)} difference`;
  return `Reported ${type} consumption ${direction} the supporting evidence by ${quantityWithUnit(input.absoluteDifference, input.unit)}${percent}.`;
}
