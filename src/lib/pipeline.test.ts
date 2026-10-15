import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TOLERANCE } from "@engine/shared/types";
import { runVerification } from "@engine/core/verification-runner";
import { ayobaMethodology } from "@engine/methodologies/ayoba/config";
import type { ConsumptionInput, EvidenceInput } from "@engine/shared/types";
import { extractEvidenceFromTable, extractEvidenceFromText, tableFromWorkbook } from "./extraction/evidence";
import { extractConsumptionRecords, parseWorkbook } from "./excel/parse";
import { buildCollectionTemplateWorkbook, buildDemonstrationEvidenceWorkbook, buildDemonstrationTemplate } from "./samples";
import type { ConsumptionRecord } from "./types";

function toConsumption(record: ConsumptionRecord): ConsumptionInput {
  return {
    id: record.id,
    facilityName: record.facilityName,
    scope: record.scope || "Scope 1",
    category: record.category || "Stationary Combustion",
    consumptionType: record.consumptionType,
    reportedConsumption: record.reportedConsumption ?? 0,
    unit: record.unit,
    reportingMonth: record.reportingMonth,
    reportingYear: record.reportingYear,
  };
}

describe("collection data template", () => {
  it("reads the standard activity tabs and quantity columns", () => {
    const workbook = parseWorkbook(buildCollectionTemplateWorkbook());
    assert.equal(workbook.needsMappingReview, false);
    assert.equal(workbook.sheets.length, 7);
    const extracted = extractConsumptionRecords({
      workbook,
      opcoId: "ayoba",
      reportingMonth: "September",
      reportingYear: 2026,
      scopeSelection: "Both",
      sourceFile: "collection-template.xlsx",
    });
    assert.equal(extracted.records.length, 7);
    const categories = new Set(extracted.records.map((record) => record.category));
    assert.ok(categories.has("Stationary Combustion"));
    assert.ok(categories.has("Mobile Combustion"));
    assert.ok(categories.has("Fugitive Emissions"));
    assert.ok(categories.has("Purchased Electricity"));
    assert.equal(extracted.records.some((record) => record.sourceSheet === "Facilities"), false);
  });
});

describe("demonstration workbook pipeline", () => {
  it("extracts the template and evidence, then applies the pilot rule", () => {
    const workbook = parseWorkbook(buildDemonstrationTemplate());
    assert.equal(workbook.needsMappingReview, false);
    const extracted = extractConsumptionRecords({
      workbook,
      opcoId: "ayoba",
      reportingMonth: "September",
      reportingYear: 2026,
      scopeSelection: "Both",
      sourceFile: "demonstration-template.xlsx",
    });
    assert.equal(extracted.records.length, 5);
    assert.equal(extracted.records.every((record) => record.missingFields.length === 0), true);

    const evidenceTable = extractEvidenceFromTable({
      documentName: "demonstration-evidence.xlsx",
      sheets: tableFromWorkbook(buildDemonstrationEvidenceWorkbook()),
    });
    const invoice = extractEvidenceFromText({
      documentName: "electricity-invoice.pdf",
      pages: [
        {
          page: 1,
          text: [
            "Invoice number: INV-2044",
            "Invoice date: 18 September 2026",
            "Supplier: Example Utility",
            "Facility: Data Centre A",
            "Reporting period: September 2026",
            "Description: Purchased electricity",
            "Consumption: 7850 kWh",
            "Meter reading: 44120",
          ].join("\n"),
        },
      ],
    });

    const evidence: EvidenceInput[] = [...evidenceTable.records, ...invoice.records].map((record, index) => ({
      id: `ev-${index}`,
      documentId: "doc",
      documentName: record.documentName,
      facilityName: record.facility,
      consumptionType: record.consumptionType,
      category: record.category,
      extractedValue: record.extractedValue,
      unit: record.unit,
      reportingMonth: record.reportingMonth,
      reportingYear: record.reportingYear,
      sourceReference: record.sourceReference,
      invoiceNumber: record.invoiceNumber,
      confidence: record.confidence,
      extractionReliable: record.extractionReliable,
    }));

    const results = runVerification({
      methodology: ayobaMethodology,
      tolerance: DEFAULT_TOLERANCE,
      records: extracted.records.map(toConsumption),
      evidence,
    });
    const byFacility = Object.fromEntries(results.map((result) => [toConsumption(extracted.records.find((record) => record.id === result.consumptionRecordId)!).facilityName, result.automatedStatus]));
    assert.equal(byFacility["Head Office"], "Verified");
    assert.equal(byFacility["Facility B"], "Missing Evidence");
    assert.equal(byFacility["Depot North"], "Verified");
    assert.equal(byFacility["Cold Store"], "Manual Review");
    assert.equal(byFacility["Data Centre A"], "Discrepancy");
  });
});
