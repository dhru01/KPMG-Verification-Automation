import type { Category, Scope } from "@engine/shared/types";
import { canonicalMonth, canonicalYear } from "@engine/core/matching-engine";
import type { ConsumptionRecord } from "./types";

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function parseNumericCell(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "–") return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[(),\s]/g, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

export function normaliseScope(value: string | null | undefined): Scope | "" {
  const text = (value ?? "").toLowerCase();
  if (!text.trim()) return "";
  if (/scope\s*2|indirect/.test(text)) return "Scope 2";
  if (/scope\s*1|direct/.test(text)) return "Scope 1";
  return "";
}

export function normaliseCategory(value: string | null | undefined): Category | "" {
  const text = (value ?? "").toLowerCase();
  if (!text.trim()) return "";
  if (text.includes("station")) return "Stationary Combustion";
  if (text.includes("mobile")) return "Mobile Combustion";
  if (text.includes("fugitive") || text.includes("refrigerant")) return "Fugitive Emissions";
  if (text.includes("electric")) return "Purchased Electricity";
  return "";
}

export function inferFromContext(text: string): { scope: Scope | ""; category: Category | "" } {
  const category = normaliseCategory(text);
  const scope = normaliseScope(text) || scopeForCategory(category);
  const consumption = text.toLowerCase();
  if (!category && /diesel|petrol|gasoline|lpg/.test(consumption)) {
    return { scope: scope || "Scope 1", category: "" };
  }
  if (!category && /r-?\d{2,3}|hfc|refrigerant/.test(consumption)) {
    return { scope: "Scope 1", category: "Fugitive Emissions" };
  }
  return { scope, category };
}

export function scopeForCategory(category: Category | ""): Scope | "" {
  if (category === "Purchased Electricity") return "Scope 2";
  if (category) return "Scope 1";
  return "";
}

export function normaliseMonth(value: string | null | undefined, fallback?: string): string {
  return canonicalMonth(value) ?? canonicalMonth(fallback) ?? "";
}

export function normaliseYear(value: string | number | null | undefined, fallback?: number): number | null {
  return canonicalYear(value) ?? (fallback ?? null);
}

export function missingConsumptionFields(record: Pick<
  ConsumptionRecord,
  | "facilityName"
  | "scope"
  | "category"
  | "consumptionType"
  | "reportedConsumption"
  | "unit"
  | "reportingMonth"
  | "reportingYear"
>): string[] {
  const missing: string[] = [];
  if (!record.facilityName.trim()) missing.push("Facility");
  if (!record.scope) missing.push("Scope");
  if (!record.category) missing.push("Category");
  if (!record.consumptionType.trim()) missing.push("Consumption type");
  if (record.reportedConsumption === null || !Number.isFinite(record.reportedConsumption)) {
    missing.push("Reported consumption");
  } else if (record.reportedConsumption < 0) {
    missing.push("Reported consumption cannot be negative");
  }
  if (!record.unit.trim()) missing.push("Unit");
  if (!record.reportingMonth) missing.push("Reporting month");
  if (!record.reportingYear) missing.push("Reporting year");
  return missing;
}

export function deriveRunStatus(run: {
  results: { automatedStatus: string; reviewerStatus: string | null }[];
  template: unknown;
  recordsConfirmed: boolean;
}): "Draft" | "In Progress" | "Pending Review" | "Completed" {
  if (run.results.length === 0) {
    return run.template || run.recordsConfirmed ? "In Progress" : "Draft";
  }
  const resolved = run.results.every(
    (result) => result.automatedStatus === "Verified" || result.reviewerStatus === "Accepted",
  );
  return resolved ? "Completed" : "Pending Review";
}
