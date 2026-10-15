import type { FieldKey } from "./types";
import type { ColumnSuggestion, SheetDefaults } from "./types";

export function normaliseSheetName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lookup or instruction tabs — not monthly activity quantities. */
export function isReferenceDataSheet(sheetName: string): boolean {
  const n = normaliseSheetName(sheetName);
  if (n === "facilities" || n === "facility" || n.startsWith("facilities ")) return true;
  if (n.includes("instruction") || n.includes("readme") || n.includes("cover page")) return true;
  if (n.includes("lookup") || n.includes("metadata") || n.includes("version history")) return true;
  return false;
}

export function isCollectionDataSheet(sheetName: string): boolean {
  const n = normaliseSheetName(sheetName);
  if (n.includes("stationary") && n.includes("combust")) return true;
  if (n.includes("mobile") && n.includes("combust")) return true;
  if (n.includes("fugitive")) return true;
  if (n.includes("electricity") && n.includes("grid")) return true;
  if (n.includes("electricity") && n.includes("ipp")) return true;
  if (n.includes("onsite") && n.includes("renew")) return true;
  return false;
}

export function collectionSheetDefaults(sheetName: string): SheetDefaults | null {
  const n = normaliseSheetName(sheetName);
  if (n.includes("stationary") && n.includes("combust")) {
    return { scope: "Scope 1", category: "Stationary Combustion" };
  }
  if (n.includes("mobile") && n.includes("combust")) {
    return { scope: "Scope 1", category: "Mobile Combustion" };
  }
  if (n.includes("fugitive")) {
    return { scope: "Scope 1", category: "Fugitive Emissions" };
  }
  if (n.includes("electricity") && (n.includes("grid") || n.includes("ipp"))) {
    return { scope: "Scope 2", category: "Purchased Electricity" };
  }
  if (n.includes("onsite") && n.includes("renew")) {
    return { scope: "Scope 2", category: "Purchased Electricity" };
  }
  return null;
}

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[_/]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function findHeader(headers: string[], aliases: string[]): string | null {
  for (const alias of aliases) {
    const target = normaliseHeader(alias);
    const exact = headers.find((header) => normaliseHeader(header) === target);
    if (exact) return exact;
  }
  for (const alias of aliases) {
    const target = normaliseHeader(alias);
    const partial = headers.find((header) => {
      const normalised = normaliseHeader(header);
      return normalised.includes(target) && target.length >= 4;
    });
    if (partial) return partial;
  }
  return null;
}

const emptySuggestion = (): ColumnSuggestion => ({ column: null, confidence: 0 });

/** Maps Facility, Quantity and Quantity unit on standard collection templates. */
export function suggestCollectionTemplateMapping(
  headers: string[],
): Record<FieldKey, ColumnSuggestion> | null {
  const facility = findHeader(headers, ["facility"]);
  const quantity = findHeader(headers, ["quantity", "qty"]);
  const unit =
    findHeader(headers, ["quantity unit", "quantity uom"]) ??
    findHeader(headers, ["unit of measure", "uom"]);

  if (!facility || !quantity || !unit) return null;

  const mapping = {
    facilityName: emptySuggestion(),
    consumptionType: emptySuggestion(),
    reportedConsumption: emptySuggestion(),
    unit: emptySuggestion(),
    scope: emptySuggestion(),
    category: emptySuggestion(),
    reportingMonth: emptySuggestion(),
    reportingYear: emptySuggestion(),
  } satisfies Record<FieldKey, ColumnSuggestion>;

  mapping.facilityName = { column: facility, confidence: 0.99 };
  mapping.reportedConsumption = { column: quantity, confidence: 0.99 };
  mapping.unit = { column: unit, confidence: 0.99 };

  return mapping;
}

/** Human-readable activity heading for grouped consumption review. */
export function activitySectionLabel(sourceSheet: string, category: string): string {
  const n = normaliseSheetName(sourceSheet);
  if (n.includes("stationary") && n.includes("combust")) return "Stationary combustion";
  if (n.includes("mobile") && n.includes("combust")) return "Mobile combustion";
  if (n.includes("fugitive")) return "Fugitive emissions";
  if (n.includes("electricity") && n.includes("grid")) return "Electricity (Grid)";
  if (n.includes("electricity") && n.includes("ipp")) return "Electricity (IPP)";
  if (n.includes("onsite") && n.includes("renew")) return "Onsite renewable";
  if (category.trim()) return category;
  return sourceSheet.trim() || "Activity data";
}

export function activitySectionSortIndex(sourceSheet: string): number {
  const n = normaliseSheetName(sourceSheet);
  if (n.includes("stationary") && n.includes("combust")) return 10;
  if (n.includes("mobile") && n.includes("combust")) return 20;
  if (n.includes("fugitive")) return 30;
  if (n.includes("electricity") && n.includes("grid")) return 40;
  if (n.includes("electricity") && n.includes("ipp")) return 50;
  if (n.includes("onsite") && n.includes("renew")) return 60;
  return 100;
}
