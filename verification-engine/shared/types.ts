export type Scope = "Scope 1" | "Scope 2";

export type Category =
  | "Stationary Combustion"
  | "Mobile Combustion"
  | "Fugitive Emissions"
  | "Purchased Electricity";

export type AutomatedStatus =
  | "Verified"
  | "Discrepancy"
  | "Missing Evidence"
  | "Manual Review"
  | "Processing Error";

export type RuleType =
  | "direct_comparison"
  | "sum_of_records"
  | "calculated_consumption"
  | "unit_conversion"
  | "reporting_period"
  | "facility_matching"
  | "missing_evidence";

export type MethodologyApprovalStatus = "pilot_not_approved" | "draft" | "approved";

export type ToleranceMode = "exact" | "absolute" | "percentage";

export type ToleranceApprovalStatus = "pilot_default" | "configured_unapproved" | "approved";

export interface ToleranceConfig {
  mode: ToleranceMode;
  absoluteTolerance?: number;
  percentageTolerance?: number;
  approvalStatus: ToleranceApprovalStatus;
  label: string;
}

export interface VerificationRule {
  id: string;
  type: RuleType;
  name: string;
  description: string;
  enabled: boolean;
  isPilot: boolean;
  parameters: Record<string, unknown>;
}

export interface Methodology {
  id: string;
  name: string;
  version: string;
  opcoId: string;
  approvalStatus: MethodologyApprovalStatus;
  description: string;
  disclaimer: string;
  rules: VerificationRule[];
}

export interface OPCOConfiguration {
  id: string;
  name: string;
  region?: string;
  verificationContactName?: string;
  isActive: boolean;
  methodologyId: string;
  supportedScopes: Scope[];
  requiredEvidenceTypes: string[];
  verificationRules: VerificationRule[];
}

export interface ConsumptionInput {
  id: string;
  facilityName: string;
  scope: Scope;
  category: Category;
  consumptionType: string;
  reportedConsumption: number;
  unit: string;
  reportingMonth: string;
  reportingYear: number;
}

export interface EvidenceInput {
  id: string;
  documentId: string;
  documentName: string;
  facilityName: string | null;
  consumptionType: string | null;
  category: Category | null;
  extractedValue: number | null;
  unit: string | null;
  reportingMonth: string | null;
  reportingYear: number | null;
  sourceReference: string | null;
  invoiceNumber: string | null;
  confidence: number | null;
  extractionReliable: boolean;
  calculationInputs?: Record<string, number>;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface CalculationBreakdown {
  reportedConsumption: number;
  evidenceConsumption: number | null;
  difference: number | null;
  absoluteDifference: number | null;
  percentageDifference: number | null;
  unit: string;
  steps: string[];
  zeroValueRuleApplied: boolean;
}

export interface MatchedEvidenceSummary {
  id: string;
  documentName: string;
  invoiceNumber: string | null;
  sourceReference: string | null;
  value: number | null;
  unit: string | null;
  reportingPeriod: string | null;
}

export interface VerificationOutput {
  consumptionRecordId: string;
  ruleId: string;
  ruleName: string;
  methodologyId: string;
  methodologyVersion: string;
  isPilotResult: boolean;
  reportedValue: number;
  evidenceValue: number | null;
  difference: number | null;
  percentageDifference: number | null;
  unit: string;
  automatedStatus: AutomatedStatus;
  explanation: string;
  conclusion: string;
  calculation: CalculationBreakdown | null;
  checks: CheckResult[];
  matchedEvidence: MatchedEvidenceSummary[];
}

export const PILOT_DISCLAIMER =
  "Pilot configuration. The direct-comparison rule is a demonstration and is not an approved Ayoba verification methodology. This output is an internal working paper. It is not an audit opinion, assurance conclusion, or formal verification certificate.";

export const CONFIDENCE_REVIEW_THRESHOLD = 0.75;

export const DEFAULT_TOLERANCE: ToleranceConfig = {
  mode: "exact",
  approvalStatus: "pilot_default",
  label: "Exact match (pilot default)",
};
