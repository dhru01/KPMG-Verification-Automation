import type { AutomatedStatus, Category, MethodologyApprovalStatus, Scope, ToleranceConfig } from "@engine/shared/types";

export type { Category, Scope };
import type { ParsedWorkbook } from "./excel/types";

export type Role = "administrator" | "consultant" | "reviewer";
export type ScopeSelection = "Scope 1" | "Scope 2" | "Both";
export type RunStatus = "Draft" | "In Progress" | "Pending Review" | "Completed";
export type ReviewerStatus = "Accepted" | "Flagged for Follow-up" | "Additional Evidence Requested";
export type DocumentProcessingStatus = "Processed" | "Needs Review" | "Attached" | "Failed";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ConsumptionRecord {
  id: string;
  opcoId: string;
  reportingMonth: string;
  reportingYear: number;
  scope: Scope | "";
  category: Category | "";
  facilityName: string;
  consumptionType: string;
  reportedConsumption: number | null;
  unit: string;
  sourceFile: string;
  sourceSheet?: string;
  sourceCell?: string;
  missingFields: string[];
}

export interface EvidenceDocument {
  id: string;
  verificationRunId: string;
  filename: string;
  fileType: string;
  storagePath: string;
  sizeBytes: number;
  uploadedAt: string;
  processingStatus: DocumentProcessingStatus;
  documentType: string | null;
  suggestedDocumentType: string | null;
  classificationConfidence: number | null;
  classificationConfirmed: boolean;
  reportingMonth: string | null;
  reportingYear: number | null;
  facility: string | null;
  category: Category | "" | null;
  previewText: string | null;
  processingNote: string | null;
}

export interface EvidenceRecord {
  id: string;
  evidenceDocumentId: string;
  documentName: string;
  facility: string | null;
  consumptionType: string | null;
  category: Category | null;
  extractedValue: number | null;
  unit: string | null;
  reportingMonth: string | null;
  reportingYear: number | null;
  reportingPeriodLabel: string | null;
  sourceReference: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  supplierName: string | null;
  meterReading: string | null;
  confidence: number | null;
  extractionReliable: boolean;
  confirmedByUser: boolean;
  calculationInputs: Record<string, number>;
  notes: string | null;
}

export interface ResultCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ResultEvidence {
  id: string;
  documentName: string;
  invoiceNumber: string | null;
  sourceReference: string | null;
  value: number | null;
  unit: string | null;
  reportingPeriod: string | null;
}

export interface VerificationResult {
  id: string;
  consumptionRecordId: string;
  ruleId: string;
  ruleName: string;
  methodologyId: string;
  methodologyVersion: string;
  isPilotResult: boolean;
  facilityName: string;
  scope: Scope | "";
  category: Category | "";
  consumptionType: string;
  reportingMonth: string;
  reportingYear: number;
  reportedValue: number;
  evidenceValue: number | null;
  difference: number | null;
  percentageDifference: number | null;
  unit: string;
  automatedStatus: AutomatedStatus;
  reviewerStatus: ReviewerStatus | null;
  reviewerComment: string | null;
  explanation: string;
  conclusion: string;
  calculationSteps: string[];
  checks: ResultCheck[];
  matchedEvidence: ResultEvidence[];
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface MethodologySnapshot {
  id: string;
  name: string;
  version: string;
  approvalStatus: MethodologyApprovalStatus;
  disclaimer: string;
  rules: Array<{
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    isPilot: boolean;
    description: string;
  }>;
}

export interface StoredTemplate {
  filename: string;
  sizeBytes: number;
  uploadedAt: string;
  storagePath: string;
  validationStatus: "Valid" | "Needs mapping review" | "Invalid";
  validationMessage: string;
}

export interface VerificationRun {
  id: string;
  opcoId: string;
  reportingMonth: string;
  reportingYear: number;
  scopeSelection: ScopeSelection;
  methodologyId: string;
  methodologyVersion: string;
  methodologySnapshot: MethodologySnapshot | null;
  toleranceSnapshot: ToleranceConfig | null;
  status: RunStatus;
  createdAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  createdBy: string;
  createdByName: string;
  reviewerName: string | null;
  isDemonstration: boolean;
  template: StoredTemplate | null;
  workbook: ParsedWorkbook | null;
  mappingConfirmed: boolean;
  recordsConfirmed: boolean;
  evidenceReviewConfirmed: boolean;
  consumptionRecords: ConsumptionRecord[];
  evidenceDocuments: EvidenceDocument[];
  evidenceRecords: EvidenceRecord[];
  results: VerificationResult[];
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  changeDetails: Record<string, unknown>;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

export interface AppSettings {
  tolerance: ToleranceConfig;
  opcoRegions: Record<string, string>;
}
