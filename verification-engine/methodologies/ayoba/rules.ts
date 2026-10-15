import type { VerificationRule } from "../../shared/types";

/**
 * Pilot rules only. These are not an approved Ayoba verification methodology.
 * Replace or reconfigure this list when the approved methodology is supplied.
 */
export const ayobaPilotRules: VerificationRule[] = [
  {
    id: "pilot.facility_matching",
    type: "facility_matching",
    name: "Facility matching",
    description: "The reported facility must correspond to the facility on the supporting evidence.",
    enabled: true,
    isPilot: true,
    parameters: {},
  },
  {
    id: "pilot.reporting_period",
    type: "reporting_period",
    name: "Reporting period validation",
    description: "Supporting evidence must relate to the selected reporting month and year.",
    enabled: true,
    isPilot: true,
    parameters: {},
  },
  {
    id: "pilot.unit_conversion",
    type: "unit_conversion",
    name: "Unit conversion",
    description: "Compatible units are converted before comparison. Mass is not converted to volume.",
    enabled: true,
    isPilot: true,
    parameters: {},
  },
  {
    id: "pilot.missing_evidence",
    type: "missing_evidence",
    name: "Missing evidence",
    description: "Records without usable supporting evidence are identified separately from discrepancies.",
    enabled: true,
    isPilot: true,
    parameters: {},
  },
  {
    id: "pilot.direct_comparison",
    type: "direct_comparison",
    name: "Direct consumption comparison",
    description:
      "Legacy pilot rule. Ayoba uses the invoice Consumption sum rule instead.",
    enabled: false,
    isPilot: true,
    parameters: { multiEvidenceStrategy: "manual_review" },
  },
  {
    id: "ayoba.sum_of_invoice_consumption",
    type: "sum_of_records",
    name: "Sum of invoice Consumption values",
    description:
      "For Ayoba electricity invoices, sum the Consumption column on the supporting PDF and compare the total to reported activity data from the collection template.",
    enabled: true,
    isPilot: true,
    parameters: {},
  },
  {
    id: "available.calculated_consumption",
    type: "calculated_consumption",
    name: "Calculated consumption",
    description: "Available for a future methodology. A formula must be configured before this rule is enabled.",
    enabled: false,
    isPilot: true,
    parameters: {},
  },
];
