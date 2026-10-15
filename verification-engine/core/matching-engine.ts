import type { Category, ConsumptionInput, EvidenceInput } from "../shared/types";
import { CONFIDENCE_REVIEW_THRESHOLD } from "../shared/types";
import { convertUnit, type UnitConversionResult } from "./unit-converter";

const MONTHS = [
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

const TYPE_ALIASES: Record<string, string> = {
  petrol: "petrol",
  gasoline: "petrol",
  diesel: "diesel",
  gasoil: "diesel",
  "gas oil": "diesel",
  electricity: "electricity",
  "purchased electricity": "electricity",
  "grid electricity": "electricity",
};

export type FacilityMatch = "exact" | "similar" | "none";
export type TypeMatch = "exact" | "weak" | "none";
export type PeriodMatch = "match" | "mismatch" | "unknown";

export interface PreparedMatch {
  evidence: EvidenceInput;
  facility: FacilityMatch;
  type: TypeMatch;
  period: PeriodMatch;
  conversion: UnitConversionResult | { ok: false; reason: string };
  reliable: boolean;
  reliabilityNote: string;
}

export function canonicalText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/centre/g, "center")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalType(value: string): string {
  const text = canonicalText(value);
  return TYPE_ALIASES[text] ?? text;
}

export function canonicalMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return MONTHS[month - 1];
  }

  const monthFirst = text.match(/^(\d{1,2})[/-](\d{4})$/);
  if (monthFirst) {
    const month = Number(monthFirst[1]);
    if (month >= 1 && month <= 12) return MONTHS[month - 1];
  }

  const embedded = MONTHS.find((month) => text.includes(month.toLowerCase()));
  if (embedded) return embedded;

  const token = text.split(/[^a-z0-9]+/).find((part) => part.length > 0);
  const fromToken = MONTHS.find(
    (month) => month.toLowerCase() === token || month.slice(0, 3).toLowerCase() === token,
  );
  if (fromToken) return fromToken;

  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return MONTHS[numeric - 1];
  return null;
}

export function canonicalYear(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1990 && value <= 2200) return value;
  if (typeof value === "string") {
    const iso = value.trim().match(/^(\d{4})-\d{1,2}/);
    if (iso) return Number(iso[1]);
    const match = value.match(/\b(19|20)\d{2}\b/);
    if (match) return Number(match[0]);
  }
  return null;
}

function facilityMatch(reported: string, evidence: string | null): FacilityMatch {
  if (!evidence || !evidence.trim()) return "none";
  const left = canonicalText(reported);
  const right = canonicalText(evidence);
  if (!left || !right) return "none";
  if (left === right) return "exact";
  const leftTokens = left.split(" ");
  const rightTokens = right.split(" ");
  const [shorter, longer] = leftTokens.length <= rightTokens.length
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens];
  if (shorter.join(" ").length < 4) return "none";
  const longerSet = new Set(longer);
  const overlap = shorter.filter((token) => longerSet.has(token)).length;
  return overlap / shorter.length >= 0.8 ? "similar" : "none";
}

function typeMatch(record: ConsumptionInput, evidence: EvidenceInput): TypeMatch {
  if (evidence.consumptionType && evidence.consumptionType.trim()) {
    if (canonicalType(record.consumptionType) === canonicalType(evidence.consumptionType)) return "exact";
    if (
      record.category === "Purchased Electricity"
      && evidence.category === "Purchased Electricity"
    ) {
      return "exact";
    }
    return "none";
  }
  if (evidence.category && evidence.category === record.category) return "weak";
  return "none";
}

function periodMatch(record: ConsumptionInput, evidence: EvidenceInput): PeriodMatch {
  const month = canonicalMonth(evidence.reportingMonth);
  const year = canonicalYear(evidence.reportingYear);
  if (!month || !year) return "unknown";
  return month === canonicalMonth(record.reportingMonth) && year === record.reportingYear ? "match" : "mismatch";
}

export function evidenceIsReliable(evidence: EvidenceInput): { reliable: boolean; note: string } {
  if (evidence.extractedValue === null || !Number.isFinite(evidence.extractedValue)) {
    return { reliable: false, note: "No numeric consumption value was extracted." };
  }
  if (!evidence.extractionReliable) {
    return { reliable: false, note: "The extraction was marked as unreliable." };
  }
  if (evidence.confidence !== null && evidence.confidence < CONFIDENCE_REVIEW_THRESHOLD) {
    return {
      reliable: false,
      note: `Extraction confidence ${Math.round(evidence.confidence * 100)}% is below the ${Math.round(CONFIDENCE_REVIEW_THRESHOLD * 100)}% review threshold.`,
    };
  }
  return { reliable: true, note: "The extracted evidence value is reliable enough for an automated comparison." };
}

export function prepareMatches(record: ConsumptionInput, evidence: EvidenceInput[]): PreparedMatch[] {
  return evidence.map((item) => {
    const reliability = evidenceIsReliable(item);
    const conversion = item.extractedValue === null || !item.unit
      ? { ok: false as const, reason: "Evidence quantity or unit is missing, so it cannot be converted." }
      : convertUnit(item.extractedValue, item.unit, record.unit);
    return {
      evidence: item,
      facility: facilityMatch(record.facilityName, item.facilityName),
      type: typeMatch(record, item),
      period: periodMatch(record, item),
      conversion,
      reliable: reliability.reliable,
      reliabilityNote: reliability.note,
    };
  });
}

export function isStrictMatch(match: PreparedMatch): boolean {
  return (
    match.facility === "exact" &&
    match.type === "exact" &&
    match.period === "match" &&
    match.conversion.ok &&
    match.reliable &&
    match.evidence.extractedValue !== null
  );
}

export function periodLabel(month: string | null, year: number | null): string | null {
  if (!month && !year) return null;
  return [month, year].filter(Boolean).join(" ");
}

export function categoriesAlign(left: Category, right: Category | null): boolean {
  return right === null || right === left;
}
