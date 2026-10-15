import * as XLSX from "xlsx";
import type { Category } from "@engine/shared/types";
import { canonicalMonth, canonicalYear } from "@engine/core/matching-engine";
import { inferFromContext, normaliseCategory, parseNumericCell } from "../records";
import type { EvidenceRecord } from "../types";

export interface ExtractedDocument {
  documentType: string;
  suggestedDocumentType: string;
  classificationConfidence: number;
  classificationConfirmed: boolean;
  reportingMonth: string | null;
  reportingYear: number | null;
  facility: string | null;
  category: Category | "" | null;
  previewText: string | null;
  processingNote: string | null;
  records: Omit<EvidenceRecord, "id" | "evidenceDocumentId">[];
}

interface TableRow {
  rowNumber: number;
  values: Record<string, string>;
}

const EVIDENCE_ALIASES = {
  facility: ["facility", "facility name", "site", "site name", "location"],
  consumptionType: ["consumption type", "fuel type", "fuel", "energy type", "description", "commodity"],
  quantity: ["quantity", "consumption", "qty", "amount", "usage", "volume", "kwh"],
  unit: ["unit", "uom", "unit of measure", "units"],
  invoiceNumber: ["invoice number", "invoice no", "invoice", "document number"],
  invoiceDate: ["invoice date", "date", "document date"],
  period: ["reporting period", "period", "billing period", "month"],
  supplier: ["supplier", "supplier name", "vendor"],
  meter: ["meter reading", "meter", "closing reading"],
};

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findColumn(headers: string[], aliases: string[]): string | null {
  let best: { header: string; score: number } | null = null;
  for (const header of headers) {
    const normalised = normaliseHeader(header);
    for (const alias of aliases) {
      const target = normaliseHeader(alias);
      const score = normalised === target ? 0.96 : normalised.includes(target) ? 0.74 : 0;
      if (score > (best?.score ?? 0)) best = { header, score };
    }
  }
  return best && best.score >= 0.74 ? best.header : null;
}

export function classifyDocument(filename: string, text: string): {
  documentType: string;
  category: Category | "";
  confidence: number;
} {
  const haystack = `${filename} ${text}`.toLowerCase();
  let documentType = "Other";
  let category: Category | "" = "";
  if (/refrigerant|r-?\d{2,3}|hfc/.test(haystack)) {
    documentType = "Refrigerant record";
    category = "Fugitive Emissions";
  } else if (/electric|kwh|mwh/.test(haystack)) {
    documentType = /invoice/.test(haystack) ? "Invoice" : "Consumption report";
    category = "Purchased Electricity";
  } else if (/diesel|petrol|gasoline|fuel/.test(haystack)) {
    documentType = /invoice/.test(haystack) ? "Invoice" : "Fuel record";
  } else if (/invoice/.test(haystack)) {
    documentType = "Invoice";
  } else if (/report/.test(haystack)) {
    documentType = "Consumption report";
  }

  const filenameHit = documentType !== "Other" && filename.toLowerCase().includes(documentType.split(" ")[0].toLowerCase());
  const contentHit = text.toLowerCase().includes(documentType.split(" ")[0].toLowerCase()) || category !== "";
  const confidence = filenameHit && contentHit ? 0.9 : contentHit ? 0.82 : filenameHit ? 0.7 : documentType === "Other" ? 0.35 : 0.66;
  return { documentType, category, confidence };
}

function periodParts(period: string | null, invoiceDate: string | null): {
  month: string | null;
  year: number | null;
  conflict: boolean;
  derivedFromDate: boolean;
} {
  const periodMonth = canonicalMonth(period);
  const periodYear = canonicalYear(period);
  const dateMonth = canonicalMonth(invoiceDate);
  const dateYear = canonicalYear(invoiceDate);
  if (periodMonth && dateMonth && (periodMonth !== dateMonth || (periodYear && dateYear && periodYear !== dateYear))) {
    return { month: null, year: null, conflict: true, derivedFromDate: false };
  }
  if (periodMonth || periodYear) {
    return { month: periodMonth, year: periodYear ?? dateYear, conflict: false, derivedFromDate: false };
  }
  if (dateMonth || dateYear) {
    return { month: dateMonth, year: dateYear, conflict: false, derivedFromDate: true };
  }
  return { month: null, year: null, conflict: false, derivedFromDate: false };
}

function labeled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function extractEvidenceFromText(input: {
  documentName: string;
  pages: { page: number; text: string }[];
}): ExtractedDocument {
  const fullText = input.pages.map((page) => page.text).join("\n");
  const classification = classifyDocument(input.documentName, fullText);
  const facility = labeled(fullText, ["facility", "site", "location"]);
  const invoiceNumber = labeled(fullText, ["invoice number", "invoice no", "invoice #"]);
  const invoiceDate = labeled(fullText, ["invoice date", "date"]);
  const supplier = labeled(fullText, ["supplier", "vendor"]);
  const meter = labeled(fullText, ["meter reading", "meter"]);
  const period = labeled(fullText, ["reporting period", "billing period", "period"]);
  const description = labeled(fullText, ["description", "fuel type", "energy type"]) ?? "";
  const inferred = inferFromContext(`${description} ${fullText.slice(0, 500)}`);
  const category = inferred.category || classification.category || null;
  const quantities: { value: number; unit: string; page: number }[] = [];
  const quantityPattern = /(\d{1,3}(?:[ ,]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(kWh|MWh|GWh|kL|m³|m3|kg|tonnes|tonne|litres|liters|litre|liter|L)\b/gi;

  for (const page of input.pages) {
    for (const match of page.text.matchAll(quantityPattern)) {
      const value = parseNumericCell(match[1]);
      if (value === null) continue;
      quantities.push({ value, unit: match[2] === "m³" ? "m3" : match[2], page: page.page });
    }
  }

  const timing = periodParts(period, invoiceDate);
  const sharedConfidence = quantities.length === 1 && facility && timing.month && !timing.conflict ? 0.88 : quantities.length > 0 ? 0.62 : 0.2;
  const records = quantities.map((quantity) => ({
    documentName: input.documentName,
    facility,
    consumptionType: description || category || null,
    category: category || null,
    extractedValue: quantity.value,
    unit: quantity.unit,
    reportingMonth: timing.month,
    reportingYear: timing.year,
    reportingPeriodLabel: [timing.month, timing.year].filter(Boolean).join(" ") || period,
    sourceReference: `Page ${quantity.page}`,
    invoiceNumber,
    invoiceDate,
    supplierName: supplier,
    meterReading: meter,
    confidence: sharedConfidence,
    extractionReliable: sharedConfidence >= 0.75 && !timing.conflict,
    confirmedByUser: false,
    calculationInputs: {},
    notes: timing.conflict
      ? "The labelled reporting period conflicts with the invoice date. Neither period was selected."
      : timing.derivedFromDate
        ? "Reporting period was taken from the invoice date."
        : null,
  }));

  const note = records.length === 0
    ? null
    : timing.conflict
      ? "A reporting-period conflict was found. Confirm the period before verification."
      : null;

  return {
    documentType: classification.documentType,
    suggestedDocumentType: classification.documentType,
    classificationConfidence: classification.confidence,
    classificationConfirmed: true,
    reportingMonth: records.length > 0 ? timing.month : null,
    reportingYear: records.length > 0 ? timing.year : null,
    facility: records.length > 0 ? facility : null,
    category: records.length > 0 ? category : null,
    previewText: fullText.slice(0, 4000),
    processingNote: note,
    records,
  };
}

function rowsFromMatrix(matrix: string[][]): { headers: string[]; rows: TableRow[] } {
  if (matrix.length === 0) return { headers: [], rows: [] };
  let headerIndex = 0;
  let best = -1;
  matrix.slice(0, 15).forEach((row, index) => {
    const score = Object.values(EVIDENCE_ALIASES).filter((aliases) =>
      row.some((cell) => aliases.some((alias) => normaliseHeader(cell) === normaliseHeader(alias) || normaliseHeader(cell).includes(normaliseHeader(alias)))),
    ).length;
    if (score > best) {
      best = score;
      headerIndex = index;
    }
  });
  const headers = (matrix[headerIndex] ?? []).map((header, index) => header || `Column ${index + 1}`);
  const rows = matrix.slice(headerIndex + 1).map((row, offset) => {
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = row[index] ?? "";
    });
    return { rowNumber: headerIndex + offset + 2, values };
  }).filter((row) => Object.values(row.values).some((value) => value.trim()));
  return { headers, rows };
}

export function extractEvidenceFromTable(input: {
  documentName: string;
  sheets: { name: string; rows: string[][] }[];
}): ExtractedDocument {
  const preview = input.sheets
    .flatMap((sheet) => sheet.rows.slice(0, 6).map((row) => row.join(" | ")))
    .join("\n");
  const classification = classifyDocument(input.documentName, preview);
  const records: ExtractedDocument["records"] = [];
  let note: string | null = null;

  for (const sheet of input.sheets) {
    const table = rowsFromMatrix(sheet.rows);
    const columns = {
      facility: findColumn(table.headers, EVIDENCE_ALIASES.facility),
      consumptionType: findColumn(table.headers, EVIDENCE_ALIASES.consumptionType),
      quantity: findColumn(table.headers, EVIDENCE_ALIASES.quantity),
      unit: findColumn(table.headers, EVIDENCE_ALIASES.unit),
      invoiceNumber: findColumn(table.headers, EVIDENCE_ALIASES.invoiceNumber),
      invoiceDate: findColumn(table.headers, EVIDENCE_ALIASES.invoiceDate),
      period: findColumn(table.headers, EVIDENCE_ALIASES.period),
      supplier: findColumn(table.headers, EVIDENCE_ALIASES.supplier),
      meter: findColumn(table.headers, EVIDENCE_ALIASES.meter),
    };
    if (!columns.quantity) {
      note = "A quantity column could not be identified. No consumption values were inferred.";
      continue;
    }
    const quantityIndex = table.headers.indexOf(columns.quantity);
    const columnLetter = String.fromCharCode(65 + Math.max(quantityIndex, 0));

    for (const row of table.rows) {
      const quantity = parseNumericCell(columns.quantity ? row.values[columns.quantity] : "");
      const consumptionType = columns.consumptionType ? row.values[columns.consumptionType] : "";
      const period = columns.period ? row.values[columns.period] : "";
      const invoiceDate = columns.invoiceDate ? row.values[columns.invoiceDate] : "";
      const timing = periodParts(period, invoiceDate);
      const inferred = inferFromContext(`${sheet.name} ${consumptionType}`);
      const category = inferred.category || null;
      if (quantity === null && !row.values[columns.facility ?? ""] && !consumptionType) continue;
      records.push({
        documentName: input.documentName,
        facility: columns.facility ? row.values[columns.facility] || null : null,
        consumptionType: consumptionType || category,
        category: category || null,
        extractedValue: quantity,
        unit: columns.unit ? row.values[columns.unit] || null : null,
        reportingMonth: timing.month,
        reportingYear: timing.year,
        reportingPeriodLabel: period || [timing.month, timing.year].filter(Boolean).join(" ") || null,
        sourceReference: `${sheet.name}!${columnLetter}${row.rowNumber}`,
        invoiceNumber: columns.invoiceNumber ? row.values[columns.invoiceNumber] || null : null,
        invoiceDate: invoiceDate || null,
        supplierName: columns.supplier ? row.values[columns.supplier] || null : null,
        meterReading: columns.meter ? row.values[columns.meter] || null : null,
        confidence: quantity === null || !columns.unit || timing.conflict ? 0.45 : 0.93,
        extractionReliable: quantity !== null && Boolean(columns.unit && row.values[columns.unit]) && !timing.conflict,
        confirmedByUser: false,
        calculationInputs: {},
        notes: timing.conflict ? "Reporting period and invoice date disagree." : null,
      });
    }
  }

  const facility = records.find((record) => record.facility)?.facility ?? null;
  const month = records.find((record) => record.reportingMonth)?.reportingMonth ?? null;
  const year = records.find((record) => record.reportingYear)?.reportingYear ?? null;
  const categories = new Set(records.map((record) => record.category).filter(Boolean));
  const mixed = categories.size > 1;
  return {
    suggestedDocumentType: mixed ? "Consumption report" : classification.documentType,
    documentType: mixed ? "Consumption report" : classification.documentType,
    classificationConfidence: mixed ? 0.64 : classification.confidence,
    classificationConfirmed: true,
    reportingMonth: records.length > 0 ? month : null,
    reportingYear: records.length > 0 ? year : null,
    facility: records.length > 0 ? facility : null,
    category: records.length > 0
      ? classification.category || records.find((record) => record.category)?.category || null
      : null,
    previewText: preview.slice(0, 4000),
    processingNote: mixed
      ? "Multiple consumption categories were found in this workbook. Review the imported rows on the next step."
      : records.length === 0
        ? null
        : note,
    records,
  };
}

export function tableFromWorkbook(buffer: Buffer): { name: string; rows: string[][] }[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  return workbook.SheetNames.map((name) => {
    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    return { name, rows: matrix.map((row) => row.map((cell) => String(cell ?? "").trim())) };
  });
}

export function tableFromCsv(text: string): { name: string; rows: string[][] }[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return [{ name: "CSV", rows }];
}

export function emptyExtraction(note: string): ExtractedDocument {
  return {
    documentType: "Other",
    suggestedDocumentType: "Other",
    classificationConfidence: 0.2,
    classificationConfirmed: true,
    reportingMonth: null,
    reportingYear: null,
    facility: null,
    category: null,
    previewText: null,
    processingNote: note,
    records: [],
  };
}
