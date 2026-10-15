import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateDifference, decideComparison } from "./calculation-engine";
import { evaluateFormula } from "./formula";
import { convertUnit } from "./unit-converter";
import { runVerification } from "./verification-runner";
import { ayobaMethodology } from "../methodologies/ayoba/config";
import { DEFAULT_TOLERANCE, type ConsumptionInput, type EvidenceInput, type Methodology } from "../shared/types";

function record(overrides: Partial<ConsumptionInput> = {}): ConsumptionInput {
  return {
    id: "rec-1",
    facilityName: "Head Office",
    scope: "Scope 1",
    category: "Mobile Combustion",
    consumptionType: "Diesel",
    reportedConsumption: 400,
    unit: "L",
    reportingMonth: "September",
    reportingYear: 2026,
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    id: "ev-1",
    documentId: "doc-1",
    documentName: "Diesel invoice.pdf",
    facilityName: "Head Office",
    consumptionType: "Diesel",
    category: "Mobile Combustion",
    extractedValue: 400,
    unit: "L",
    reportingMonth: "September",
    reportingYear: 2026,
    sourceReference: "Page 1",
    invoiceNumber: "INV-1001",
    confidence: 0.95,
    extractionReliable: true,
    ...overrides,
  };
}

describe("difference calculations", () => {
  it("calculates the worked example of 400 L against 395 L", () => {
    const result = calculateDifference(400, 395);
    assert.equal(result.difference, 5);
    assert.equal(result.absoluteDifference, 5);
    assert.ok(Math.abs((result.percentageDifference ?? 0) - 1.2658227848) < 0.000001);
    assert.equal(result.zeroValueRuleApplied, false);
  });

  it("does not divide by zero when evidence consumption is zero", () => {
    const bothZero = calculateDifference(0, 0);
    assert.equal(bothZero.percentageDifference, null);
    assert.equal(decideComparison(bothZero, DEFAULT_TOLERANCE).decision, "verified");

    const reportedOnly = calculateDifference(10, 0);
    assert.equal(reportedOnly.percentageDifference, null);
    assert.equal(decideComparison(reportedOnly, DEFAULT_TOLERANCE).decision, "manual_review");
  });

  it("applies percentage tolerance only after an approved-style configuration is supplied", () => {
    const result = calculateDifference(105, 100);
    assert.equal(
      decideComparison(result, {
        mode: "percentage",
        percentageTolerance: 5,
        approvalStatus: "configured_unapproved",
        label: "5%",
      }).decision,
      "verified",
    );
    assert.equal(decideComparison(result, DEFAULT_TOLERANCE).decision, "discrepancy");
  });
});

describe("unit conversion", () => {
  it("converts energy and volume units", () => {
    const energy = convertUnit(1, "MWh", "kWh");
    const volume = convertUnit(0.12, "kL", "L");
    const cubic = convertUnit(2, "m3", "L");
    assert.equal(energy.ok && energy.value, 1000);
    assert.equal(volume.ok && volume.value, 120);
    assert.equal(cubic.ok && cubic.value, 2000);
  });

  it("does not convert mass to volume", () => {
    const result = convertUnit(10, "kg", "L");
    assert.equal(result.ok, false);
  });
});

describe("formulas", () => {
  it("evaluates a configured arithmetic formula", () => {
    assert.equal(evaluateFormula("(opening - closing) * factor", { opening: 20, closing: 5, factor: 2 }), 30);
  });

  it("rejects a missing input instead of inventing a value", () => {
    assert.throws(() => evaluateFormula("quantity * factor", { quantity: 4 }));
  });
});

describe("Ayoba pilot verification", () => {
  it("verifies an exact match and labels the result as a pilot result", () => {
    const [result] = runVerification({
      methodology: ayobaMethodology,
      tolerance: DEFAULT_TOLERANCE,
      records: [record()],
      evidence: [evidence()],
    });
    assert.equal(result.automatedStatus, "Verified");
    assert.equal(result.isPilotResult, true);
    assert.equal(result.ruleName, "Sum of invoice Consumption values");
    assert.match(result.conclusion, /matches the supporting evidence/i);
  });

  it("reports a discrepancy for 8,000 kWh against 7,850 kWh", () => {
    const [result] = runVerification({
      methodology: ayobaMethodology,
      tolerance: DEFAULT_TOLERANCE,
      records: [
        record({
          facilityName: "Data Centre A",
          scope: "Scope 2",
          category: "Purchased Electricity",
          consumptionType: "Electricity",
          reportedConsumption: 8000,
          unit: "kWh",
        }),
      ],
      evidence: [
        evidence({
          facilityName: "Data Centre A",
          category: "Purchased Electricity",
          consumptionType: "Electricity",
          extractedValue: 7850,
          unit: "kWh",
        }),
      ],
    });
    assert.equal(result.automatedStatus, "Discrepancy");
    assert.equal(result.difference, 150);
    assert.ok(Math.abs((result.percentageDifference ?? 0) - 1.910828025) < 0.000001);
    assert.match(result.conclusion, /exceeds the supporting evidence by 150 kWh/i);
  });

  it("marks a record as missing evidence when nothing matches", () => {
    const [result] = runVerification({
      methodology: ayobaMethodology,
      tolerance: DEFAULT_TOLERANCE,
      records: [record({ facilityName: "Facility B", category: "Stationary Combustion", reportedConsumption: 600 })],
      evidence: [],
    });
    assert.equal(result.automatedStatus, "Missing Evidence");
  });

  it("flags a reporting-period mismatch for review", () => {
    const [result] = runVerification({
      methodology: ayobaMethodology,
      tolerance: DEFAULT_TOLERANCE,
      records: [record()],
      evidence: [evidence({ reportingMonth: "August" })],
    });
    assert.equal(result.automatedStatus, "Manual Review");
    assert.match(result.explanation, /reporting period/i);
  });

  it("converts kL to L before an exact comparison", () => {
    const [result] = runVerification({
      methodology: ayobaMethodology,
      tolerance: DEFAULT_TOLERANCE,
      records: [record({ consumptionType: "Petrol", reportedConsumption: 120 })],
      evidence: [evidence({ consumptionType: "Petrol", extractedValue: 0.12, unit: "kL" })],
    });
    assert.equal(result.automatedStatus, "Verified");
    assert.equal(result.evidenceValue, 120);
  });

  it("does not pass a low-confidence extraction", () => {
    const [result] = runVerification({
      methodology: ayobaMethodology,
      tolerance: DEFAULT_TOLERANCE,
      records: [record()],
      evidence: [evidence({ confidence: 0.4 })],
    });
    assert.equal(result.automatedStatus, "Manual Review");
  });

  it("sums multiple matching evidence records for Ayoba", () => {
    const [result] = runVerification({
      methodology: ayobaMethodology,
      tolerance: DEFAULT_TOLERANCE,
      records: [record({ reportedConsumption: 700 })],
      evidence: [evidence({ extractedValue: 400 }), evidence({ id: "ev-2", extractedValue: 300 })],
    });
    assert.equal(result.automatedStatus, "Verified");
    assert.equal(result.evidenceValue, 700);
  });

  it("can sum evidence when that rule is enabled instead of the pilot rule", () => {
    const methodology: Methodology = {
      ...ayobaMethodology,
      approvalStatus: "draft",
      rules: ayobaMethodology.rules.map((rule) => {
        if (rule.type === "direct_comparison") return { ...rule, enabled: false };
        if (rule.type === "sum_of_records") return { ...rule, enabled: true, isPilot: false };
        return rule;
      }),
    };
    const [result] = runVerification({
      methodology,
      tolerance: DEFAULT_TOLERANCE,
      records: [record({ reportedConsumption: 700 })],
      evidence: [evidence({ extractedValue: 400 }), evidence({ id: "ev-2", extractedValue: 300 })],
    });
    assert.equal(result.automatedStatus, "Verified");
    assert.equal(result.evidenceValue, 700);
    assert.equal(result.ruleName, "Sum of invoice Consumption values");
  });
});
