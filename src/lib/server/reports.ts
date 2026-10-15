import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { PILOT_DISCLAIMER } from "@engine/shared/types";
import { getOpcoConfiguration } from "@engine/methodologies/registry";
import { buildAyobaVerificationExcel } from "./ayoba-verification-sheet";
import type { VerificationResult, VerificationRun } from "../types";
import { formatPercent, formatQuantity } from "../utils";

function opcoName(opcoId: string): string {
  return getOpcoConfiguration(opcoId)?.name ?? opcoId;
}

function count(results: VerificationResult[], status: VerificationResult["automatedStatus"]): number {
  return results.filter((result) => result.automatedStatus === status).length;
}

function resultRows(results: VerificationResult[]) {
  return results.map((result) => ({
    Facility: result.facilityName,
    Scope: result.scope,
    Category: result.category,
    "Consumption type": result.consumptionType,
    Reported: result.reportedValue,
    Unit: result.unit,
    Evidence: result.evidenceValue ?? "",
    Difference: result.difference ?? "",
    "Percentage difference": result.percentageDifference === null ? "" : Number(result.percentageDifference.toFixed(2)),
    "Automated status": result.automatedStatus,
    "Reviewer decision": result.reviewerStatus ?? "",
    "Reviewer comment": result.reviewerComment ?? "",
    Explanation: result.explanation,
    Conclusion: result.conclusion,
  }));
}

export async function buildExcelReport(run: VerificationRun): Promise<Buffer> {
  if (run.opcoId === "ayoba") {
    return buildAyobaVerificationExcel(run);
  }

  const book = XLSX.utils.book_new();
  const results = run.results;
  const summary = [
    ["GHG Verification Hub"],
    ["Internal verification working paper"],
    [],
    ["Disclaimer", PILOT_DISCLAIMER],
    ["Automated checks are recorded separately from reviewer decisions."],
    [],
    ["OPCO", opcoName(run.opcoId)],
    ["Reporting period", `${run.reportingMonth} ${run.reportingYear}`],
    ["Methodology", run.methodologySnapshot?.name ?? run.methodologyId],
    ["Methodology version", run.methodologyVersion],
    ["Approval status", run.methodologySnapshot?.approvalStatus ?? "pilot_not_approved"],
    ["Tolerance", run.toleranceSnapshot?.label ?? ""],
    ["Verification date", run.verifiedAt ?? ""],
    ["Prepared by", run.createdByName],
    ["Reviewer", run.reviewerName ?? ""],
    ["Run status", run.status],
    [],
    ["Total records", results.length],
    ["Verified", count(results, "Verified")],
    ["Discrepancies", count(results, "Discrepancy")],
    ["Missing evidence", count(results, "Missing Evidence")],
    ["Manual review", count(results, "Manual Review")],
    ["Processing errors", count(results, "Processing Error")],
  ];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), "Executive Summary");

  const groups: Array<[string, VerificationResult["automatedStatus"]]> = [
    ["Verified Records", "Verified"],
    ["Discrepancies", "Discrepancy"],
    ["Missing Evidence", "Missing Evidence"],
    ["Manual Review", "Manual Review"],
  ];
  for (const [sheetName, status] of groups) {
    const rows = resultRows(results.filter((result) => result.automatedStatus === status));
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Facility: "No records" }]),
      sheetName,
    );
  }

  const calculations = results.map((result) => ({
    Facility: result.facilityName,
    Category: result.category,
    Rule: result.ruleName,
    "Pilot result": result.isPilotResult ? "Yes" : "No",
    Steps: result.calculationSteps.join(" | "),
    "Source evidence": result.matchedEvidence
      .map((item) => `${item.documentName} ${item.sourceReference ?? ""} ${item.invoiceNumber ?? ""}`.trim())
      .join("; "),
  }));
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(calculations.length > 0 ? calculations : [{ Facility: "No calculations" }]),
    "Verification Calculations",
  );

  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildPdfReport(run: VerificationRun): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const results = run.results;
    doc.fillColor("#0c2340").font("Helvetica-Bold").fontSize(18).text("GHG Verification Hub");
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(12).fillColor("#1d4e89").text("Verification working paper");
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor("#7c4a03").text(PILOT_DISCLAIMER, { width: 500 });
    doc.moveDown();
    doc.fillColor("#0f172a").font("Helvetica").fontSize(11);
    const lines = [
      `OPCO: ${opcoName(run.opcoId)}`,
      `Reporting period: ${run.reportingMonth} ${run.reportingYear}`,
      `Verification date: ${run.verifiedAt ? new Date(run.verifiedAt).toLocaleString("en-GB") : "Not completed"}`,
      `Methodology version: ${run.methodologyVersion}`,
      `Tolerance: ${run.toleranceSnapshot?.label ?? "Not recorded"}`,
      `Prepared by: ${run.createdByName}`,
      `Reviewer: ${run.reviewerName ?? "No reviewer decision recorded"}`,
      `Overall status: ${run.status}`,
    ];
    lines.forEach((line) => doc.text(line));
    doc.moveDown();
    doc.font("Helvetica-Bold").text("Summary of automated checks");
    doc.moveDown(0.3);
    doc.font("Helvetica");
    [
      `Total records: ${results.length}`,
      `Verified records: ${count(results, "Verified")}`,
      `Discrepancies: ${count(results, "Discrepancy")}`,
      `Missing evidence: ${count(results, "Missing Evidence")}`,
      `Records requiring review: ${count(results, "Manual Review")}`,
      `Processing errors: ${count(results, "Processing Error")}`,
    ].forEach((line) => doc.text(line));
    doc.moveDown();
    doc.font("Helvetica-Bold").text("Findings");
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10);
    if (results.length === 0) {
      doc.text("No verification results have been produced for this run.");
    }
    results.forEach((result, index) => {
      doc.font("Helvetica-Bold").text(
        `${index + 1}. ${result.facilityName} — ${result.category} — ${result.automatedStatus}`,
      );
      doc.font("Helvetica").text(
        `Reported ${formatQuantity(result.reportedValue)} ${result.unit}; evidence ${formatQuantity(result.evidenceValue)} ${result.evidenceValue === null ? "" : result.unit}; difference ${formatQuantity(result.difference)}; percentage ${formatPercent(result.percentageDifference)}.`,
      );
      doc.text(result.conclusion);
      doc.text(`Reviewer decision: ${result.reviewerStatus ?? "Pending"}. ${result.reviewerComment ?? ""}`);
      doc.moveDown(0.4);
    });
    doc.moveDown();
    doc.fontSize(9).fillColor("#475569").text(
      "Automated statuses describe the configured pilot checks. A reviewer decision is recorded separately and does not rewrite the automated result. This document is not an audit opinion, assurance conclusion, or formal verification certificate.",
    );
    doc.end();
  });
}
