import type { ParsedRow, ParsedSheet } from "./excel/types";
import type { EvidenceDocument, StoredTemplate, VerificationRun } from "./types";

export interface ClientSheet {
  name: string;
  headerRowNumber: number;
  headers: string[];
  suggestedMapping: ParsedSheet["suggestedMapping"];
  sheetDefaults: ParsedSheet["sheetDefaults"];
  rowCount: number;
  preview: ParsedRow[];
}

export type ClientEvidenceDocument = Omit<EvidenceDocument, "storagePath">;
export type ClientTemplate = Omit<StoredTemplate, "storagePath">;

export type ClientRun = Omit<VerificationRun, "workbook" | "template" | "evidenceDocuments"> & {
  workbook: { sheets: ClientSheet[] } | null;
  template: ClientTemplate | null;
  evidenceDocuments: ClientEvidenceDocument[];
};

export function toClientRun(run: VerificationRun): ClientRun {
  const { workbook, template, evidenceDocuments, ...rest } = run;
  return {
    ...rest,
    template: template
      ? {
          filename: template.filename,
          sizeBytes: template.sizeBytes,
          uploadedAt: template.uploadedAt,
          validationStatus: template.validationStatus,
          validationMessage: template.validationMessage,
        }
      : null,
    workbook: workbook
      ? {
          sheets: workbook.sheets.map((sheet) => ({
            name: sheet.name,
            headerRowNumber: sheet.headerRowNumber,
            headers: sheet.headers,
            suggestedMapping: sheet.suggestedMapping,
            sheetDefaults: sheet.sheetDefaults,
            rowCount: sheet.rows.length,
            preview: sheet.rows.slice(0, 5),
          })),
        }
      : null,
    evidenceDocuments: evidenceDocuments.map(({ storagePath: _storagePath, ...document }) => document),
  };
}
