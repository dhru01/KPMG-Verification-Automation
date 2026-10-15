import crypto from "node:crypto";
import type { EvidenceRecord, VerificationRun } from "../types";
import {
  buildAyobaMethodologyNote,
  extractAyobaInvoiceConsumption,
  type AyobaInvoiceExtraction,
} from "../extraction/ayoba-invoice";
import { extractPdfPages, extractWithLocalProcessor } from "./processor";
import { readUpload } from "./store";

export interface AyobaDocumentExtraction {
  documentId: string;
  documentName: string;
  extraction: AyobaInvoiceExtraction;
  records: EvidenceRecord[];
}

export interface AyobaVerificationPrep {
  documents: AyobaDocumentExtraction[];
  methodologyNotes: string[];
}

async function pdfPages(filename: string, bytes: Buffer) {
  const processor = await extractWithLocalProcessor(filename, bytes);
  if (processor?.pages.length) return processor.pages;
  return extractPdfPages(bytes);
}

function electricityTargets(run: VerificationRun) {
  return run.consumptionRecords.filter((record) => record.category === "Purchased Electricity");
}

function aggregatedRecord(
  run: VerificationRun,
  document: { id: string; filename: string },
  extraction: AyobaInvoiceExtraction,
  target: VerificationRun["consumptionRecords"][number],
): EvidenceRecord {
  return {
    id: crypto.randomUUID(),
    evidenceDocumentId: document.id,
    documentName: document.filename,
    facility: target.facilityName,
    consumptionType: target.consumptionType,
    category: "Purchased Electricity",
    extractedValue: extraction.total,
    unit: extraction.unit,
    reportingMonth: run.reportingMonth,
    reportingYear: run.reportingYear,
    reportingPeriodLabel: `${run.reportingMonth} ${run.reportingYear}`,
    sourceReference: "Sum of invoice Consumption column",
    invoiceNumber: null,
    invoiceDate: null,
    supplierName: null,
    meterReading: null,
    confidence: extraction.lines.length > 0 ? 0.92 : 0.2,
    extractionReliable: extraction.lines.length > 0,
    confirmedByUser: false,
    calculationInputs: {
      ayobaInvoiceTotal: extraction.total,
    },
    notes: buildAyobaMethodologyNote(document.filename, extraction),
  };
}

function buildRecordsForDocument(
  run: VerificationRun,
  document: { id: string; filename: string },
  extraction: AyobaInvoiceExtraction,
): EvidenceRecord[] {
  const targets = electricityTargets(run);
  if (targets.length === 0 || extraction.lines.length === 0) return [];

  const target = targets.length === 1 ? targets[0] : targets[0];
  return [aggregatedRecord(run, document, extraction, target)];
}

export async function prepareAyobaVerification(run: VerificationRun): Promise<AyobaVerificationPrep> {
  const documents: AyobaDocumentExtraction[] = [];
  const methodologyNotes: string[] = [];

  for (const document of run.evidenceDocuments) {
    if (document.fileType !== "PDF") continue;
    const bytes = await readUpload(document.storagePath);
    const pages = await pdfPages(document.filename, bytes);
    const fullText = pages.map((page) => page.text).join("\n");
    const extraction = extractAyobaInvoiceConsumption(fullText);
    const note = buildAyobaMethodologyNote(document.filename, extraction);
    methodologyNotes.push(note);
    const records = buildRecordsForDocument(run, document, extraction);
    documents.push({ documentId: document.id, documentName: document.filename, extraction, records });
  }

  return { documents, methodologyNotes };
}

export function applyAyobaVerificationPrep(run: VerificationRun, prep: AyobaVerificationPrep) {
  for (const item of prep.documents) {
    run.evidenceRecords = run.evidenceRecords.filter((record) => record.evidenceDocumentId !== item.documentId);
    if (item.records.length > 0) {
      run.evidenceRecords.push(...item.records);
    } else if (item.extraction.lines.length === 0) {
      const targets = electricityTargets(run);
      const target = targets[0];
      if (target) {
        run.evidenceRecords.push({
          id: crypto.randomUUID(),
          evidenceDocumentId: item.documentId,
          documentName: item.documentName,
          facility: target.facilityName,
          consumptionType: target.consumptionType,
          category: "Purchased Electricity",
          extractedValue: null,
          unit: "kWh",
          reportingMonth: run.reportingMonth,
          reportingYear: run.reportingYear,
          reportingPeriodLabel: `${run.reportingMonth} ${run.reportingYear}`,
          sourceReference: item.documentName,
          invoiceNumber: null,
          invoiceDate: null,
          supplierName: null,
          meterReading: null,
          confidence: 0.2,
          extractionReliable: false,
          confirmedByUser: false,
          calculationInputs: {},
          notes: buildAyobaMethodologyNote(item.documentName, item.extraction),
        });
      }
    }
    const document = run.evidenceDocuments.find((entry) => entry.id === item.documentId);
    if (document) {
      document.processingStatus = item.records.length > 0 ? "Processed" : "Needs Review";
      document.processingNote = item.extraction.lines.length > 0
        ? `Ayoba invoice extraction: ${item.extraction.lines.length} Consumption value${item.extraction.lines.length === 1 ? "" : "s"} totalling ${item.extraction.total} ${item.extraction.unit}.`
        : "Ayoba invoice extraction could not read Consumption values from this PDF.";
      document.category = "Purchased Electricity";
    }
  }
}

export function methodologyNoteForResult(
  prep: AyobaVerificationPrep,
  category: string,
): string | null {
  if (category !== "Purchased Electricity" || prep.methodologyNotes.length === 0) return null;
  return prep.methodologyNotes.join(" ");
}
