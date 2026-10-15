import * as XLSX from "xlsx";
import type { ScopeSelection } from "../types";
import type { ConsumptionRecord } from "../types";
import {
  inferFromContext,
  missingConsumptionFields,
  normaliseCategory,
  normaliseMonth,
  normaliseScope,
  normaliseYear,
  parseNumericCell,
  scopeForCategory,
} from "../records";
import {
  collectionSheetDefaults,
  isCollectionDataSheet,
  isReferenceDataSheet,
  suggestCollectionTemplateMapping,
} from "./collection-template";
import {
  FIELD_KEYS,
  type AppliedSheetMapping,
  type ColumnSuggestion,
  type FieldKey,
  type ParsedSheet,
  type ParsedWorkbook,
} from "./types";

const TEMPLATE_ALIASES: Record<FieldKey, string[]> = {
  facilityName: ["facility", "facility name", "site", "site name", "location", "branch"],
  consumptionType: ["consumption type", "fuel type", "fuel", "energy type", "refrigerant", "commodity"],
  reportedConsumption: ["reported consumption", "consumption", "quantity", "qty", "amount", "usage", "volume"],
  unit: ["quantity unit", "quantity uom", "unit", "uom", "unit of measure", "units"],
  scope: ["scope", "emission scope"],
  category: ["category", "emissions category", "emission category", "source category"],
  reportingMonth: ["reporting month", "month", "period month"],
  reportingYear: ["reporting year", "year"],
};

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[_/]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreHeader(header: string, aliases: string[]): number {
  const normalised = normaliseHeader(header);
  if (!normalised) return 0;
  let best = 0;
  for (const alias of aliases) {
    const target = normaliseHeader(alias);
    if (normalised === target) best = Math.max(best, 0.96);
    else if (normalised.includes(target)) best = Math.max(best, 0.74);
  }
  return best;
}

export function suggestMapping(headers: string[]): Record<FieldKey, ColumnSuggestion> {
  const pairs: { field: FieldKey; header: string; confidence: number }[] = [];
  for (const field of FIELD_KEYS) {
    for (const header of headers) {
      const confidence = scoreHeader(header, TEMPLATE_ALIASES[field]);
      if (confidence > 0) pairs.push({ field, header, confidence });
    }
  }
  pairs.sort((left, right) => right.confidence - left.confidence);
  const usedHeaders = new Set<string>();
  const usedFields = new Set<FieldKey>();
  const mapping = Object.fromEntries(
    FIELD_KEYS.map((field) => [field, { column: null, confidence: 0 }]),
  ) as Record<FieldKey, ColumnSuggestion>;

  for (const pair of pairs) {
    if (usedFields.has(pair.field) || usedHeaders.has(pair.header)) continue;
    mapping[pair.field] = { column: pair.header, confidence: pair.confidence };
    usedFields.add(pair.field);
    usedHeaders.add(pair.header);
  }
  return mapping;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function sheetCells(sheet: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return rows.map((row) => row.map((cell) => String(cell ?? "").trim()));
}

function headerScore(row: string[]): number {
  return row.reduce((score, cell) => {
    const best = Math.max(...FIELD_KEYS.map((field) => scoreHeader(cell, TEMPLATE_ALIASES[field])));
    return score + (best >= 0.74 ? 1 : 0);
  }, 0);
}

function sheetDefaults(name: string): { scope: string; category: string } {
  const collection = collectionSheetDefaults(name);
  if (collection) return collection;
  const inferred = inferFromContext(name);
  return { scope: inferred.scope, category: inferred.category };
}

function mappingIsConfident(
  mapping: Record<FieldKey, ColumnSuggestion>,
  defaults: { scope: string; category: string },
): boolean {
  const required: FieldKey[] = ["facilityName", "reportedConsumption", "unit"];
  if (required.some((field) => mapping[field].confidence < 0.74 || !mapping[field].column)) return false;
  const hasType = Boolean(mapping.consumptionType.column && mapping.consumptionType.confidence >= 0.74);
  const hasCategory = Boolean(mapping.category.column && mapping.category.confidence >= 0.74) || Boolean(defaults.category);
  return hasType || hasCategory;
}

function detectHeaderRowIndex(matrix: string[][], sheetName: string): number {
  const scanLimit = isCollectionDataSheet(sheetName) ? 40 : 15;
  if (isCollectionDataSheet(sheetName)) {
    for (let index = 0; index < Math.min(matrix.length, scanLimit); index++) {
      const row = matrix[index] ?? [];
      const headers = row.map((header, columnIndex) => header || `Column ${columnLetter(columnIndex)}`);
      if (suggestCollectionTemplateMapping(headers)) return index;
    }
  }
  let headerIndex = 0;
  let bestScore = -1;
  matrix.slice(0, scanLimit).forEach((row, index) => {
    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  });
  return headerIndex;
}

function parseSheet(workbook: XLSX.WorkBook, name: string): ParsedSheet {
    const matrix = sheetCells(workbook.Sheets[name]);
    const headerIndex = detectHeaderRowIndex(matrix, name);
    const headerRow = matrix[headerIndex] ?? [];
    const headers = headerRow.map((header, index) => header || `Column ${columnLetter(index)}`);
    const rows = matrix.slice(headerIndex + 1).map((row, offset) => {
      const values: Record<string, string> = {};
      headers.forEach((header, index) => {
        values[header] = row[index] ?? "";
      });
      return { rowNumber: headerIndex + offset + 2, values };
    }).filter((row) => Object.values(row.values).some((value) => value.trim().length > 0));

    const defaults = sheetDefaults(name);
    const collectionMapping = isCollectionDataSheet(name) ? suggestCollectionTemplateMapping(headers) : null;
    const suggestedMapping = collectionMapping ?? suggestMapping(headers);
    return {
      name,
      headerRowNumber: headerIndex + 1,
      headers,
      suggestedMapping,
      sheetDefaults: defaults,
      rows,
    };
}

export function parseWorkbook(buffer: Buffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const parsed = workbook.SheetNames
    .map((name) => parseSheet(workbook, name))
    .filter((sheet) => sheet.rows.length > 0 && !isReferenceDataSheet(sheet.name));
  const collectionSheets = parsed.filter((sheet) => isCollectionDataSheet(sheet.name));
  const sheets = collectionSheets.length > 0 ? collectionSheets : parsed;

  return {
    sheets,
    needsMappingReview: sheets.some((sheet) => !mappingIsConfident(sheet.suggestedMapping, sheet.sheetDefaults)),
  };
}

function cell(row: ParsedSheet["rows"][number], column: string | null): string {
  if (!column) return "";
  return row.values[column] ?? "";
}

export function extractConsumptionRecords(input: {
  workbook: ParsedWorkbook;
  applied?: AppliedSheetMapping[];
  opcoId: string;
  reportingMonth: string;
  reportingYear: number;
  scopeSelection: ScopeSelection;
  sourceFile: string;
}): { records: ConsumptionRecord[]; excludedBecauseScope: number } {
  const records: ConsumptionRecord[] = [];
  let excludedBecauseScope = 0;

  for (const sheet of input.workbook.sheets) {
    const applied = input.applied?.find((item) => item.name === sheet.name);
    const mapping = applied?.mapping ?? Object.fromEntries(
      FIELD_KEYS.map((field) => [field, sheet.suggestedMapping[field].column]),
    ) as Record<FieldKey, string | null>;
    const defaults = applied?.defaults ?? sheet.sheetDefaults;
    const headerIndex = new Map(sheet.headers.map((header, index) => [header, index]));

    for (const row of sheet.rows) {
      const facilityName = cell(row, mapping.facilityName);
      const consumptionType = cell(row, mapping.consumptionType);
      const rawQuantity = cell(row, mapping.reportedConsumption);
      const unit = cell(row, mapping.unit);
      const categoryText = cell(row, mapping.category) || defaults.category;
      const scopeText = cell(row, mapping.scope) || defaults.scope;
      const inferred = inferFromContext(`${sheet.name} ${consumptionType} ${categoryText}`);
      const category = normaliseCategory(categoryText) || inferred.category;
      const scope = normaliseScope(scopeText) || scopeForCategory(category) || inferred.scope;
      const month = normaliseMonth(cell(row, mapping.reportingMonth), input.reportingMonth);
      const year = normaliseYear(cell(row, mapping.reportingYear), input.reportingYear) ?? input.reportingYear;

      if (!facilityName && !consumptionType && !rawQuantity && !unit) continue;

      const reportedValue = parseNumericCell(rawQuantity);
      if (!facilityName.trim() || reportedValue === null || !unit.trim()) continue;

      if (scope && input.scopeSelection !== "Both" && scope !== input.scopeSelection) {
        excludedBecauseScope += 1;
        continue;
      }

      const quantityColumn = mapping.reportedConsumption;
      const sourceColumn = quantityColumn ? columnLetter(headerIndex.get(quantityColumn) ?? 0) : "A";
      const record: ConsumptionRecord = {
        id: crypto.randomUUID(),
        opcoId: input.opcoId,
        reportingMonth: month,
        reportingYear: year,
        scope,
        category,
        facilityName,
        consumptionType: consumptionType || category,
        reportedConsumption: reportedValue,
        unit,
        sourceFile: input.sourceFile,
        sourceSheet: sheet.name,
        sourceCell: `${sourceColumn}${row.rowNumber}`,
        missingFields: [],
      };
      record.missingFields = missingConsumptionFields(record);
      records.push(record);
    }
  }

  return { records, excludedBecauseScope };
}
