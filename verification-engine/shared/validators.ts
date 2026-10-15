import type { Methodology, ToleranceConfig } from "./types";

const COMPARISON_RULES = new Set(["direct_comparison", "sum_of_records", "calculated_consumption"]);

export function validateMethodology(methodology: Methodology): string[] {
  const errors: string[] = [];
  const enabledComparisons = methodology.rules.filter(
    (rule) => rule.enabled && COMPARISON_RULES.has(rule.type),
  );

  if (enabledComparisons.length !== 1) {
    errors.push(
      "Enable exactly one comparison rule: direct comparison, sum of supporting records, or calculated consumption.",
    );
  }

  const calculated = methodology.rules.find(
    (rule) => rule.enabled && rule.type === "calculated_consumption",
  );
  if (calculated) {
    const expression = calculated.parameters.expression;
    if (typeof expression !== "string" || expression.trim().length === 0) {
      errors.push("Calculated consumption requires an expression parameter.");
    }
  }

  return errors;
}

export function validateTolerance(tolerance: ToleranceConfig): string[] {
  const errors: string[] = [];
  if (tolerance.mode === "absolute") {
    if (
      tolerance.absoluteTolerance === undefined ||
      !Number.isFinite(tolerance.absoluteTolerance) ||
      tolerance.absoluteTolerance < 0
    ) {
      errors.push("Absolute tolerance must be zero or a positive number.");
    }
  }
  if (tolerance.mode === "percentage") {
    if (
      tolerance.percentageTolerance === undefined ||
      !Number.isFinite(tolerance.percentageTolerance) ||
      tolerance.percentageTolerance < 0
    ) {
      errors.push("Percentage tolerance must be zero or a positive number.");
    }
  }
  return errors;
}
