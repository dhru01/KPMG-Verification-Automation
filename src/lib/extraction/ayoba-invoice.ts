import { parseNumericCell } from "../records";

export interface AyobaInvoiceConsumptionLine {
  value: number;
  raw: string;
  lineIndex: number;
}

export interface AyobaInvoiceExtraction {
  lines: AyobaInvoiceConsumptionLine[];
  total: number;
  unit: string;
  methodologyNote: string;
  sourceSection: "consumption_column" | "detached_column" | "invoice_total" | "single_labelled_value" | "none";
}

const VALUE_TOKEN = /^(-|–|—|\d{1,3}(?:[ ,]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)$/;

function electricalSection(text: string): string {
  const water = text.search(/\bwater\s+tariff\b/i);
  if (water > 0) return text.slice(0, water);
  return text;
}

function parseValueToken(token: string): number | null {
  const trimmed = token.trim();
  if (!trimmed || /^[-–—]$/.test(trimmed)) return 0;
  return parseNumericCell(trimmed.replace(/,/g, ""));
}

function detectUnit(section: string): string {
  const match = section.match(/\b(kWh|MWh|GWh)\b/i);
  if (!match) return "kWh";
  const unit = match[1];
  if (unit.toLowerCase() === "kwh") return "kWh";
  return unit;
}

function isSummaryOrChargesLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^(energy total|common area total|total consumption|charges|vat|sub ?total|amount due|total cost)/i.test(trimmed)
    || /\btotal\s+cost\b/i.test(trimmed)
    || /\b15%\s*vat\b/i.test(trimmed)
  );
}

function isMeterDataRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || isSummaryOrChargesLine(trimmed)) return false;
  if (/^(meter serial|consumption|opening|closing|tariff|description|factor|billable)/i.test(trimmed)) return false;
  if (VALUE_TOKEN.test(trimmed)) return true;
  if (/\b(energy charge|common area|hvac|lwc)/i.test(trimmed)) return true;
  if (/\b[A-Z]{2,}\d{4,}/i.test(trimmed)) return true;
  if (/\b\d{8,}\b/.test(trimmed)) return true;
  return false;
}

function consumptionValueFromMeterRow(line: string): { value: number; raw: string } | null {
  const trimmed = line.trim();
  if (VALUE_TOKEN.test(trimmed)) {
    const value = parseValueToken(trimmed);
    return value === null ? null : { value, raw: trimmed };
  }
  const trailing = trimmed.match(/(\d+\.\d{2})\s*$/);
  if (trailing) {
    const value = parseValueToken(trailing[1]);
    return value === null ? null : { value, raw: trailing[1] };
  }
  if (/^[-–—]$/.test(trimmed.split(/\s+/).at(-1) ?? "")) {
    return { value: 0, raw: "-" };
  }
  return null;
}

/** Reads only the electricity meter table Consumption column (top-right values), not charge subtotals. */
function extractFromConsumptionColumn(section: string): AyobaInvoiceConsumptionLine[] {
  const lines = section.split(/\r?\n/).map((line) => line.trim());
  let headerIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^consumption$/i.test(line)) {
      headerIndex = index;
      break;
    }
    if (/\bconsumption\b/i.test(line) && !/common area consumption/i.test(line) && /\bmeter serial\b/i.test(line)) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) {
    const meterHeader = lines.findIndex((line) => /\bmeter serial\b/i.test(line) && /\bconsumption\b/i.test(line));
    if (meterHeader >= 0) headerIndex = meterHeader;
  }
  if (headerIndex < 0) return [];

  const collected: AyobaInvoiceConsumptionLine[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) break;
    if (isSummaryOrChargesLine(line)) break;
    if (/^charges\b/i.test(line)) break;
    if (!isMeterDataRow(line)) {
      if (collected.length > 0) break;
      continue;
    }
    const parsed = consumptionValueFromMeterRow(line);
    if (!parsed) break;
    if (parsed.value > 100_000) continue;
    collected.push({ value: parsed.value, raw: parsed.raw, lineIndex: index });
    if (collected.length >= 8) break;
  }
  return collected;
}

function extractElectricalTotalKwh(fullText: string): number | null {
  for (const line of fullText.split(/\r?\n/)) {
    const trimmed = line.trim();
    const footerTotal = trimmed.match(/^(\d{1,5}(?:\.\d{2})?)\s+([\d,]+\.\d{2})\s*$/);
    if (footerTotal) {
      const kwh = parseNumericCell(footerTotal[1].replace(/,/g, ""));
      const amount = parseNumericCell(footerTotal[2].replace(/,/g, ""));
      if (kwh !== null && amount !== null && amount > 400 && kwh < 500_000) {
        return kwh;
      }
    }
  }

  const totalCost = fullText.match(/total\s+cost[\s\S]{0,160}?(\d[\d,.]*)\s*kWh/i);
  if (totalCost) {
    const value = parseNumericCell(totalCost[1].replace(/,/g, ""));
    if (value !== null) return value;
  }
  const totals = [...fullText.matchAll(/(\d[\d,.]*)\s*kWh/gi)]
    .map((match) => parseNumericCell(match[1].replace(/,/g, "")))
    .filter((value): value is number => value !== null && value > 0 && value < 500_000);
  if (totals.length === 0) return null;
  return Math.max(...totals);
}

/**
 * Growthpoint / Livewire PDFs often render the Consumption column away from meter rows
 * (e.g. at the page footer) when text is extracted from the PDF.
 */
function extractDetachedConsumptionPairs(fullText: string): AyobaInvoiceConsumptionLine[] {
  const collected: AyobaInvoiceConsumptionLine[] = [];
  for (const [index, line] of fullText.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    const pair = trimmed.match(/^([\d,]+\.\d{2})\s+(\d+\.\d{2})\s*$/);
    if (!pair) continue;
    const leading = parseNumericCell(pair[1].replace(/,/g, ""));
    const consumption = parseNumericCell(pair[2].replace(/,/g, ""));
    if (leading === null || consumption === null) continue;
    if (leading === consumption) continue;
    if (consumption > 2_000) continue;
    if (leading <= consumption) continue;
    collected.push({ value: consumption, raw: pair[2], lineIndex: index });
    if (collected.length >= 8) break;
  }
  return collected;
}

function extractSingleLabelledValue(section: string): AyobaInvoiceConsumptionLine[] {
  const match = section.match(/consumption\s*[:]\s*([\d,.\s]+)\s*(kWh|MWh|GWh)?/i);
  if (!match?.[1]) return [];
  const value = parseNumericCell(match[1].replace(/,/g, "").trim());
  if (value === null) return [];
  return [{ value, raw: match[1].trim(), lineIndex: -1 }];
}

function reconcileWithInvoiceTotal(
  columnLines: AyobaInvoiceConsumptionLine[],
  invoiceTotal: number | null,
): AyobaInvoiceConsumptionLine[] {
  if (columnLines.length === 0) return columnLines;
  const columnSum = columnLines.reduce((sum, line) => sum + line.value, 0);
  if (invoiceTotal === null) return columnLines;
  if (Math.abs(columnSum - invoiceTotal) < 0.02) return columnLines;
  return [{ value: invoiceTotal, raw: formatTotal(invoiceTotal), lineIndex: -1 }];
}

function methodologyIntro(
  sourceSection: AyobaInvoiceExtraction["sourceSection"],
  parts: string[],
  total: number,
  unit: string,
): string {
  if (sourceSection === "consumption_column" || sourceSection === "detached_column") {
    return `Ayoba verification: Summed the Consumption column on the electricity invoice (${parts.join(" + ")} = ${formatTotal(total)} ${unit}). Compared the total to reported activity data from the collection template.`;
  }
  if (sourceSection === "invoice_total") {
    return `Ayoba verification: Read the electricity total consumption on the invoice (${formatTotal(total)} ${unit}) and compared it to reported activity data from the collection template.`;
  }
  return `Ayoba verification: Read the labelled invoice consumption (${parts[0]} ${unit}) and compared it to reported activity data from the collection template.`;
}

export function extractAyobaInvoiceConsumption(fullText: string): AyobaInvoiceExtraction {
  const section = electricalSection(fullText);
  const unit = detectUnit(fullText);
  const invoiceTotal = extractElectricalTotalKwh(fullText);

  let lines = extractFromConsumptionColumn(section);
  let sourceSection: AyobaInvoiceExtraction["sourceSection"] = lines.length > 0 ? "consumption_column" : "none";

  if (lines.length === 0) {
    lines = extractDetachedConsumptionPairs(fullText);
    sourceSection = lines.length > 0 ? "detached_column" : "none";
  }

  if (lines.length > 0 && invoiceTotal !== null) {
    const reconciled = reconcileWithInvoiceTotal(lines, invoiceTotal);
    if (reconciled.length === 1 && reconciled[0].lineIndex === -1) {
      lines = reconciled;
      sourceSection = "invoice_total";
    } else {
      lines = reconciled;
    }
  }

  if (lines.length === 0 && invoiceTotal !== null) {
    lines = [{ value: invoiceTotal, raw: formatTotal(invoiceTotal), lineIndex: -1 }];
    sourceSection = "invoice_total";
  }
  if (lines.length === 0) {
    lines = extractSingleLabelledValue(fullText);
    sourceSection = lines.length > 0 ? "single_labelled_value" : "none";
  }

  const total = lines.reduce((sum, line) => sum + line.value, 0);
  const parts = lines.map((line) => (line.raw === "-" || line.raw === "–" ? "0" : line.raw.replace(/,/g, "")));
  const methodologyNote = lines.length === 0
    ? "Ayoba verification: No Consumption values could be read from the electricity invoice. A reviewer must enter or confirm values manually."
    : methodologyIntro(sourceSection, parts, total, unit);

  return { lines, total, unit, methodologyNote, sourceSection };
}

function formatTotal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function buildAyobaMethodologyNote(
  documentName: string,
  extraction: AyobaInvoiceExtraction,
): string {
  if (extraction.lines.length === 0) {
    return `${extraction.methodologyNote} Document: ${documentName}.`;
  }
  const parts = extraction.lines.map((line) => (line.raw === "-" || line.raw === "–" ? "0" : line.raw));
  if (extraction.lines.length === 1) {
    return `Ayoba verification (${documentName}): invoice electricity consumption ${formatTotal(extraction.total)} ${extraction.unit} compared to the reported figure in the data collection template.`;
  }
  return `Ayoba verification (${documentName}): summed Consumption column values ${parts.join(" + ")} = ${formatTotal(extraction.total)} ${extraction.unit}. Compared to the reported figure in the data collection template.`;
}
