import {
  buildCalculationSteps,
  buildConclusion,
  calculateDifference,
  decideComparison,
} from "./calculation-engine";
import { evaluateFormula, formulaErrorMessage } from "./formula";
import { isStrictMatch, periodLabel, prepareMatches, type PreparedMatch } from "./matching-engine";
import { formatQuantity } from "../shared/display";
import type {
  AutomatedStatus,
  CalculationBreakdown,
  CheckResult,
  ConsumptionInput,
  EvidenceInput,
  MatchedEvidenceSummary,
  Methodology,
  ToleranceConfig,
  VerificationOutput,
  VerificationRule,
} from "../shared/types";
import { validateMethodology } from "../shared/validators";

export interface VerificationRunInput {
  methodology: Methodology;
  tolerance: ToleranceConfig;
  records: ConsumptionInput[];
  evidence: EvidenceInput[];
}

function enabledRule(methodology: Methodology, type: VerificationRule["type"]): VerificationRule | undefined {
  return methodology.rules.find((rule) => rule.enabled && rule.type === type);
}

function summarise(match: PreparedMatch): MatchedEvidenceSummary {
  return {
    id: match.evidence.id,
    documentName: match.evidence.documentName,
    invoiceNumber: match.evidence.invoiceNumber,
    sourceReference: match.evidence.sourceReference,
    value: match.evidence.extractedValue,
    unit: match.evidence.unit,
    reportingPeriod: periodLabel(match.evidence.reportingMonth, match.evidence.reportingYear),
  };
}

function output(input: {
  record: ConsumptionInput;
  methodology: Methodology;
  rule: VerificationRule;
  status: AutomatedStatus;
  explanation: string;
  conclusion: string;
  evidenceValue?: number | null;
  difference?: number | null;
  percentageDifference?: number | null;
  calculation?: CalculationBreakdown | null;
  checks: CheckResult[];
  matches?: PreparedMatch[];
}): VerificationOutput {
  return {
    consumptionRecordId: input.record.id,
    ruleId: input.rule.id,
    ruleName: input.rule.name,
    methodologyId: input.methodology.id,
    methodologyVersion: input.methodology.version,
    isPilotResult: input.methodology.approvalStatus !== "approved" || input.rule.isPilot,
    reportedValue: input.record.reportedConsumption,
    evidenceValue: input.evidenceValue ?? null,
    difference: input.difference ?? null,
    percentageDifference: input.percentageDifference ?? null,
    unit: input.record.unit,
    automatedStatus: input.status,
    explanation: input.explanation,
    conclusion: input.conclusion,
    calculation: input.calculation ?? null,
    checks: input.checks,
    matchedEvidence: (input.matches ?? []).map(summarise),
  };
}

function relevantMatches(matches: PreparedMatch[]): PreparedMatch[] {
  return matches.filter((match) => match.facility !== "none" && match.type !== "none");
}

function describeCandidate(record: ConsumptionInput, match: PreparedMatch): string {
  const bits = [
    match.facility === "exact"
      ? "facility matches"
      : match.facility === "similar"
        ? "facility name is similar but not exact"
        : "facility does not match",
    match.type === "exact"
      ? "consumption type matches"
      : match.type === "weak"
        ? "category matches but the consumption type was not extracted"
        : "consumption type does not match",
    match.period === "match"
      ? "reporting period matches"
      : match.period === "mismatch"
        ? `reporting period ${periodLabel(match.evidence.reportingMonth, match.evidence.reportingYear) ?? "on the evidence"} does not match ${record.reportingMonth} ${record.reportingYear}`
        : "reporting period was not extracted",
  ];
  if (!match.conversion.ok) bits.push(match.conversion.reason);
  else if (match.conversion.converted) {
    bits.push(
      `converted ${formatQuantity(match.evidence.extractedValue ?? 0)} ${match.evidence.unit} to ${formatQuantity(match.conversion.value)} ${record.unit}`,
    );
  }
  if (!match.reliable) bits.push(match.reliabilityNote);
  return bits.join("; ");
}

function compareValue(
  record: ConsumptionInput,
  evidenceValue: number,
  tolerance: ToleranceConfig,
  evidenceLabel: string,
): {
  status: AutomatedStatus;
  explanation: string;
  conclusion: string;
  calculation: CalculationBreakdown;
} {
  const difference = calculateDifference(record.reportedConsumption, evidenceValue);
  const decision = decideComparison(difference, tolerance);
  const status: AutomatedStatus =
    decision.decision === "verified"
      ? "Verified"
      : decision.decision === "discrepancy"
        ? "Discrepancy"
        : "Manual Review";
  const steps = buildCalculationSteps(difference, record.unit, evidenceLabel);
  return {
    status,
    explanation: decision.reason,
    conclusion: buildConclusion({
      consumptionType: record.consumptionType,
      unit: record.unit,
      reported: record.reportedConsumption,
      evidence: evidenceValue,
      absoluteDifference: difference.absoluteDifference,
      percentageDifference: difference.percentageDifference,
      decision: decision.decision,
      zeroValueRuleApplied: difference.zeroValueRuleApplied,
    }),
    calculation: {
      reportedConsumption: difference.reportedConsumption,
      evidenceConsumption: difference.evidenceConsumption,
      difference: difference.difference,
      absoluteDifference: difference.absoluteDifference,
      percentageDifference: difference.percentageDifference,
      unit: record.unit,
      steps,
      zeroValueRuleApplied: difference.zeroValueRuleApplied,
    },
  };
}

function strictValue(match: PreparedMatch): number {
  if (!match.conversion.ok) {
    throw new Error("Strict matches must have a successful unit conversion.");
  }
  return match.conversion.value;
}

function verifyRecord(
  record: ConsumptionInput,
  evidence: EvidenceInput[],
  methodology: Methodology,
  tolerance: ToleranceConfig,
  comparisonRule: VerificationRule,
): VerificationOutput {
  const matches = prepareMatches(record, evidence);
  const related = relevantMatches(matches);
  const strict = matches.filter(isStrictMatch);
  const checks: CheckResult[] = [];

  const facilityRule = enabledRule(methodology, "facility_matching");
  const periodRule = enabledRule(methodology, "reporting_period");
  const unitRule = enabledRule(methodology, "unit_conversion");
  const missingRule = enabledRule(methodology, "missing_evidence");

  if (related.length === 0) {
    if (facilityRule) {
      checks.push({
        name: facilityRule.name,
        passed: false,
        detail: `No supporting evidence matched ${record.facilityName}.`,
      });
    }
    if (missingRule) {
      checks.push({
        name: missingRule.name,
        passed: false,
        detail: "Required supporting evidence is not available for this record.",
      });
    }
    return output({
      record,
      methodology,
      rule: missingRule ?? comparisonRule,
      status: "Missing Evidence",
      explanation: `No supporting evidence was matched to ${record.facilityName} for ${record.consumptionType} in ${record.reportingMonth} ${record.reportingYear}.`,
      conclusion: `No supporting evidence was matched to ${record.facilityName} for ${record.consumptionType} in ${record.reportingMonth} ${record.reportingYear}. The record is marked as missing evidence.`,
      checks,
    });
  }

  const blocked = related.find(
    (match) =>
      match.facility === "similar" ||
      match.type === "weak" ||
      match.period !== "match" ||
      !match.conversion.ok ||
      !match.reliable,
  );

  if (facilityRule) {
    const exact = related.some((match) => match.facility === "exact");
    checks.push({
      name: facilityRule.name,
      passed: exact,
      detail: exact
        ? `${record.facilityName} matches the facility on the supporting evidence.`
        : `The facility on the supporting evidence is not an exact match for ${record.facilityName}.`,
    });
  }

  if (periodRule) {
    const matched = related.some((match) => match.period === "match");
    checks.push({
      name: periodRule.name,
      passed: matched,
      detail: matched
        ? `Supporting evidence covers ${record.reportingMonth} ${record.reportingYear}.`
        : `Supporting evidence does not clearly cover ${record.reportingMonth} ${record.reportingYear}.`,
    });
  }

  if (unitRule) {
    const converted = related.find((match) => match.conversion.ok);
    checks.push({
      name: unitRule.name,
      passed: Boolean(converted),
      detail: converted
        ? converted.conversion.ok && converted.conversion.converted
          ? `Converted ${converted.evidence.unit} to ${record.unit} before comparison.`
          : `Evidence is already in ${record.unit}.`
        : related.find((match) => !match.conversion.ok)?.conversion.ok === false
          ? (related.find((match) => !match.conversion.ok)?.conversion as { reason: string }).reason
          : "Unit conversion could not be completed.",
    });
  }

  if (strict.length === 0) {
    const reason = blocked
      ? describeCandidate(record, blocked)
      : "Supporting evidence was found, but none of it can be used for an automated comparison.";
    return output({
      record,
      methodology,
      rule: comparisonRule,
      status: "Manual Review",
      explanation: `Supporting evidence was found, but it cannot be used for an automated result. ${reason}`,
      conclusion: `Supporting evidence for ${record.facilityName} / ${record.consumptionType} needs review before a comparison can be accepted. ${reason}.`,
      checks,
      matches: related,
    });
  }

  if (comparisonRule.type === "direct_comparison") {
    if (strict.length > 1) {
      checks.push({
        name: comparisonRule.name,
        passed: false,
        detail: `${strict.length} evidence records match. The pilot direct-comparison rule does not combine them.`,
      });
      return output({
        record,
        methodology,
        rule: comparisonRule,
        status: "Manual Review",
        explanation: `The pilot direct-comparison rule found ${strict.length} supporting records for ${record.facilityName} / ${record.consumptionType}. This pilot configuration does not define how to combine multiple evidence records.`,
        conclusion: `${strict.length} supporting records match ${record.facilityName} / ${record.consumptionType}. The pilot rule leaves aggregation for a reviewer.`,
        checks,
        matches: strict,
      });
    }

    const match = strict[0];
    const evidenceValue = strictValue(match);
    const compared = compareValue(record, evidenceValue, tolerance, "Supporting evidence");
    checks.push({
      name: comparisonRule.name,
      passed: compared.status === "Verified",
      detail: compared.explanation,
    });
    return output({
      record,
      methodology,
      rule: comparisonRule,
      status: compared.status,
      explanation: `${comparisonRule.name}: ${compared.explanation}`,
      conclusion: compared.conclusion,
      evidenceValue,
      difference: compared.calculation.difference,
      percentageDifference: compared.calculation.percentageDifference,
      calculation: compared.calculation,
      checks,
      matches: [match],
    });
  }

  if (comparisonRule.type === "sum_of_records") {
    if (related.length !== strict.length) {
      checks.push({
        name: comparisonRule.name,
        passed: false,
        detail: "One or more related evidence records could not be included in the sum.",
      });
      return output({
        record,
        methodology,
        rule: comparisonRule,
        status: "Manual Review",
        explanation: "The sum rule found related evidence that is incomplete, unreliable, or outside the reporting period. Those records were not added together.",
        conclusion: `Supporting records for ${record.facilityName} / ${record.consumptionType} need review before they can be summed.`,
        checks,
        matches: related,
      });
    }
    const total = strict.reduce((sum, match) => sum + strictValue(match), 0);
    const compared = compareValue(record, total, tolerance, "Sum of supporting evidence");
    checks.push({
      name: comparisonRule.name,
      passed: compared.status === "Verified",
      detail: `${strict.length} supporting records total ${formatQuantity(total)} ${record.unit}. ${compared.explanation}`,
    });
    return output({
      record,
      methodology,
      rule: comparisonRule,
      status: compared.status,
      explanation: compared.explanation,
      conclusion: compared.conclusion,
      evidenceValue: total,
      difference: compared.calculation.difference,
      percentageDifference: compared.calculation.percentageDifference,
      calculation: compared.calculation,
      checks,
      matches: strict,
    });
  }

  const expression = comparisonRule.parameters.expression;
  if (typeof expression !== "string" || !expression.trim()) {
    return output({
      record,
      methodology,
      rule: comparisonRule,
      status: "Processing Error",
      explanation: "The calculated-consumption rule is enabled without a formula.",
      conclusion: "Verification could not run because the methodology formula is missing.",
      checks,
      matches: strict,
    });
  }

  const inputs = strict[0]?.evidence.calculationInputs ?? {};
  try {
    const calculated = evaluateFormula(expression, inputs);
    const compared = compareValue(record, calculated, tolerance, "Calculated evidence consumption");
    const steps = [
      `Formula: ${expression}`,
      ...Object.entries(inputs).map(([key, value]) => `${key} = ${formatQuantity(value)}`),
      ...compared.calculation.steps,
    ];
    checks.push({
      name: comparisonRule.name,
      passed: compared.status === "Verified",
      detail: compared.explanation,
    });
    return output({
      record,
      methodology,
      rule: comparisonRule,
      status: compared.status,
      explanation: compared.explanation,
      conclusion: compared.conclusion,
      evidenceValue: calculated,
      difference: compared.calculation.difference,
      percentageDifference: compared.calculation.percentageDifference,
      calculation: { ...compared.calculation, steps },
      checks,
      matches: strict.slice(0, 1),
    });
  } catch (error) {
    return output({
      record,
      methodology,
      rule: comparisonRule,
      status: "Manual Review",
      explanation: formulaErrorMessage(error),
      conclusion: `The configured formula could not be applied to ${record.facilityName} / ${record.consumptionType}. ${formulaErrorMessage(error)}`,
      checks,
      matches: strict,
    });
  }
}

export function runVerification(input: VerificationRunInput): VerificationOutput[] {
  const configurationErrors = validateMethodology(input.methodology);
  const comparisonRule =
    input.methodology.rules.find(
      (rule) =>
        rule.enabled &&
        (rule.type === "direct_comparison" ||
          rule.type === "sum_of_records" ||
          rule.type === "calculated_consumption"),
    ) ?? input.methodology.rules[0];

  return input.records.map((record) => {
    if (!Number.isFinite(record.reportedConsumption)) {
      return output({
        record,
        methodology: input.methodology,
        rule: comparisonRule,
        status: "Processing Error",
        explanation: "Reported consumption is missing or not a number.",
        conclusion: "This record could not be verified because the reported consumption is not numeric.",
        checks: [],
      });
    }

    if (configurationErrors.length > 0) {
      return output({
        record,
        methodology: input.methodology,
        rule: comparisonRule,
        status: "Processing Error",
        explanation: configurationErrors.join(" "),
        conclusion: "Verification did not run because the methodology configuration is incomplete.",
        checks: [],
      });
    }

    try {
      return verifyRecord(record, input.evidence, input.methodology, input.tolerance, comparisonRule);
    } catch (error) {
      return output({
        record,
        methodology: input.methodology,
        rule: comparisonRule,
        status: "Processing Error",
        explanation: error instanceof Error ? error.message : "Verification failed.",
        conclusion: "A technical issue prevented verification of this record.",
        checks: [],
      });
    }
  });
}
