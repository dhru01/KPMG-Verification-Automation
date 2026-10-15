export type FieldKey =
  | "facilityName"
  | "consumptionType"
  | "reportedConsumption"
  | "unit"
  | "scope"
  | "category"
  | "reportingMonth"
  | "reportingYear";

export interface ColumnSuggestion {
  column: string | null;
  confidence: number;
}

export interface SheetDefaults {
  scope: string;
  category: string;
}

export interface ParsedRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParsedSheet {
  name: string;
  headerRowNumber: number;
  headers: string[];
  suggestedMapping: Record<FieldKey, ColumnSuggestion>;
  sheetDefaults: SheetDefaults;
  rows: ParsedRow[];
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  needsMappingReview: boolean;
}

export interface AppliedSheetMapping {
  name: string;
  mapping: Record<FieldKey, string | null>;
  defaults: SheetDefaults;
}

export const FIELD_KEYS: FieldKey[] = [
  "facilityName",
  "consumptionType",
  "reportedConsumption",
  "unit",
  "scope",
  "category",
  "reportingMonth",
  "reportingYear",
];

export const FIELD_LABELS: Record<FieldKey, string> = {
  facilityName: "Facility",
  consumptionType: "Consumption type",
  reportedConsumption: "Reported consumption",
  unit: "Unit",
  scope: "Scope",
  category: "Emissions category",
  reportingMonth: "Reporting month",
  reportingYear: "Reporting year",
};
