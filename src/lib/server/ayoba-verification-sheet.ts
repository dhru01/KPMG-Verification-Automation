import ExcelJS from "exceljs";
import { ayobaConfiguration } from "@engine/methodologies/ayoba/config";
import { getOpcoConfiguration } from "@engine/methodologies/registry";
import { MONTHS } from "../records";
import type { ConsumptionRecord, VerificationResult, VerificationRun } from "../types";

/** Standard Scope 2 facility rows on the Ayoba verification results template. */
export const AYOBA_SCOPE2_FACILITY_TYPES = [
  "BTS Sites - Owned and Operated",
  "BTS Sites - Operated but not owned",
  "Buildings - Head Office",
  "Buildings - Regional Office",
  "Buildings - Call Centres",
  "Buildings - Technical Office",
  "Buildings - Warehouses",
  "Buildings - Residentials",
  "Data Centres",
  "Switches",
  "Hubs",
  "Stores - Owned and Operated",
];

const COLORS = {
  orange: "FFFFC000",
  green: "FF548235",
  black: "FF000000",
  gray: "FFD9D9D9",
  white: "FFFFFFFF",
};

function collectionQuarterLabel(month: string): string {
  const index = MONTHS.indexOf(month);
  const quarter = index >= 0 ? Math.floor(index / 3) + 1 : 1;
  return `Q${quarter} - ${month}`;
}

function alignmentLabel(status: VerificationResult["automatedStatus"]): string {
  if (status === "Verified") return "Yes.";
  if (status === "Discrepancy") return "No.";
  if (status === "Missing Evidence") return "No supporting evidence matched.";
  return "Requires review.";
}

function purchasedElectricitySource(record: ConsumptionRecord): string {
  const sheet = (record.sourceSheet ?? "").toLowerCase();
  if (sheet.includes("ipp")) return "Electricity from independent power producer (IPP)";
  if (sheet.includes("renew")) return "Onsite renewable generation";
  if (record.consumptionType && record.consumptionType !== "Purchased Electricity") {
    return record.consumptionType;
  }
  return "Electricity from the grid";
}

function facilityMatchScore(facilityName: string, facilityType: string): number {
  const facility = facilityName.toLowerCase();
  const template = facilityType.toLowerCase();
  if (facility === template) return 100;
  if (facility.startsWith(template)) return 95;
  if (facility.includes(template)) return 85;
  const tokens = template.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  const overlap = tokens.filter((token) => facility.includes(token)).length;
  if (overlap >= 2) return 60 + overlap * 5;
  if (overlap === 1 && tokens.length === 1) return 55;
  return 0;
}

function mapRecordsToFacilityTypes(
  records: ConsumptionRecord[],
  facilityTypes: string[],
): Map<string, ConsumptionRecord> {
  const assignments = new Map<string, ConsumptionRecord>();
  const unassigned = [...records];

  for (const facilityType of facilityTypes) {
    let best: { record: ConsumptionRecord; score: number } | null = null;
    for (const record of unassigned) {
      const score = facilityMatchScore(record.facilityName, facilityType);
      if (score > 0 && (!best || score > best.score)) {
        best = { record, score };
      }
    }
    if (best) {
      assignments.set(facilityType, best.record);
      unassigned.splice(unassigned.indexOf(best.record), 1);
    }
  }

  for (const record of unassigned) {
    let bestType: { type: string; score: number } | null = null;
    for (const facilityType of facilityTypes) {
      if (assignments.has(facilityType)) continue;
      const score = facilityMatchScore(record.facilityName, facilityType);
      if (score > 0 && (!bestType || score > bestType.score)) {
        bestType = { type: facilityType, score };
      }
    }
    if (bestType) assignments.set(bestType.type, record);
  }

  return assignments;
}

function borderThin(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };
  return { top: side, left: side, bottom: side, right: side };
}

function fillCell(
  cell: ExcelJS.Cell,
  argb: string,
  options?: { bold?: boolean; color?: string; align?: Partial<ExcelJS.Alignment> },
) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  cell.font = {
    bold: options?.bold ?? false,
    color: options?.color ? { argb: options.color } : undefined,
  };
  cell.alignment = { vertical: "middle", wrapText: true, ...options?.align };
  cell.border = borderThin();
}

export async function buildAyobaVerificationExcel(run: VerificationRun): Promise<Buffer> {
  const opco = getOpcoConfiguration(run.opcoId) ?? ayobaConfiguration;
  const resultByRecordId = new Map(run.results.map((result) => [result.consumptionRecordId, result]));
  const electricity = run.consumptionRecords.filter((record) => record.category === "Purchased Electricity");
  const recordsByFacilityType = mapRecordsToFacilityTypes(electricity, AYOBA_SCOPE2_FACILITY_TYPES);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Verification Results");
  sheet.views = [{ showGridLines: false }];

  const widths = [34, 32, 14, 18, 16, 14, 14, 42];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  // Metadata block (label column A, value column B — adjacent, no gap)
  const metaRows = [
    ["OPCO Name", opco.name],
    ["Relevant SPOC name", opco.verificationContactName ?? ""],
    ["Period of Data Collection", collectionQuarterLabel(run.reportingMonth)],
  ] as const;
  metaRows.forEach(([label, value], index) => {
    const row = index + 1;
    const labelCell = sheet.getCell(`A${row}`);
    labelCell.value = label;
    fillCell(labelCell, COLORS.orange, { bold: true });
    const valueCell = sheet.getCell(`B${row}`);
    valueCell.value = value;
    fillCell(valueCell, COLORS.white);
  });

  // Reporting month banner
  sheet.mergeCells("A6:H6");
  const monthCell = sheet.getCell("A6");
  monthCell.value = run.reportingMonth;
  fillCell(monthCell, COLORS.orange, { bold: true, align: { horizontal: "center" } });
  sheet.getRow(6).height = 22;

  // Section title
  sheet.mergeCells("A10:H10");
  const titleCell = sheet.getCell("A10");
  titleCell.value = "Scope 2 Purchased Electricity";
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { vertical: "middle" };

  const headers = [
    "Facility Type",
    "Source of Purchased Electricity",
    "Unit of Consumption",
    "Activity Data Input",
    "Verified Number",
    "Difference",
    "% Difference",
    "Does the reported activity data align with the verification documentation",
  ];
  const headerRow = sheet.getRow(11);
  headerRow.height = 36;
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    const isVerification = index >= 4;
    fillCell(cell, isVerification ? COLORS.green : COLORS.black, {
      bold: true,
      color: COLORS.white,
      align: { horizontal: "center", vertical: "middle", wrapText: true },
    });
  });

  let inputTotal = 0;
  let verifiedTotal = 0;
  let differenceTotal = 0;
  let dataRowIndex = 12;

  function writeDataRow(
    facilityType: string,
    record: ConsumptionRecord | null,
    result: VerificationResult | null,
    shaded: boolean,
  ) {
    const row = sheet.getRow(dataRowIndex);
    const reported = record?.reportedConsumption ?? null;
    const verified = result?.evidenceValue ?? null;
    const difference =
      result?.difference ?? (reported !== null && verified !== null ? reported - verified : null);
    const percent =
      result?.percentageDifference !== null && result?.percentageDifference !== undefined
        ? result.percentageDifference / 100
        : reported !== null && difference !== null && reported !== 0
          ? difference / reported
          : null;

    if (reported !== null) inputTotal += reported;
    if (verified !== null) verifiedTotal += verified;
    if (difference !== null) differenceTotal += difference;

    const values = [
      facilityType,
      record ? purchasedElectricitySource(record) : "",
      record?.unit ?? "",
      reported,
      verified,
      difference,
      percent,
      result ? alignmentLabel(result.automatedStatus) : "",
    ];

    values.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      if (colIndex === 6 && typeof value === "number") {
        cell.numFmt = "0.00%";
      } else if (colIndex >= 3 && colIndex <= 5 && typeof value === "number") {
        cell.numFmt = colIndex === 3 || colIndex === 4 ? "0.00" : "0.00";
      }
      fillCell(cell, shaded ? COLORS.gray : COLORS.white, {
        align: { vertical: "middle", horizontal: colIndex >= 3 ? "right" : "left", wrapText: true },
      });
    });
    dataRowIndex += 1;
  }

  AYOBA_SCOPE2_FACILITY_TYPES.forEach((facilityType) => {
    const record = recordsByFacilityType.get(facilityType) ?? null;
    const result = record ? resultByRecordId.get(record.id) ?? null : null;
    writeDataRow(facilityType, record, result, record === null);
  });

  const totalRow = sheet.getRow(dataRowIndex);
  totalRow.height = 20;
  const percentTotal = inputTotal === 0 ? null : differenceTotal / inputTotal;
  const totalValues = [
    "Scope 2 Purchased Electricity TOTAL",
    "",
    "",
    inputTotal || "",
    verifiedTotal || "",
    differenceTotal || "",
    percentTotal,
    "",
  ];
  totalValues.forEach((value, colIndex) => {
    const cell = totalRow.getCell(colIndex + 1);
    cell.value = value;
    if (colIndex === 6 && typeof value === "number") cell.numFmt = "0.00%";
    if (colIndex >= 3 && colIndex <= 5 && typeof value === "number") cell.numFmt = "0.00";
    fillCell(cell, COLORS.orange, {
      bold: colIndex === 0,
      align: { vertical: "middle", horizontal: colIndex >= 3 ? "right" : "left" },
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
