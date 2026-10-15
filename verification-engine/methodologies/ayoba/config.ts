import type { Methodology, OPCOConfiguration } from "../../shared/types";
import { PILOT_DISCLAIMER } from "../../shared/types";
import { ayobaPilotRules } from "./rules";

export const AYOBA_METHODOLOGY_ID = "ayoba-invoice-consumption-sum";
export const AYOBA_METHODOLOGY_VERSION = "0.2.0-ayoba";

export const ayobaMethodology: Methodology = {
  id: AYOBA_METHODOLOGY_ID,
  name: "Ayoba invoice Consumption sum",
  version: AYOBA_METHODOLOGY_VERSION,
  opcoId: "ayoba",
  approvalStatus: "pilot_not_approved",
  description:
    "Ayoba Scope 2 electricity: sum Consumption values from the supporting utility invoice PDF and compare the total to reported activity data in the monthly collection template.",
  disclaimer: PILOT_DISCLAIMER,
  rules: ayobaPilotRules,
};

export const ayobaConfiguration: OPCOConfiguration = {
  id: "ayoba",
  name: "Ayoba",
  region: "South Africa",
  verificationContactName: "Muneebah Antulay",
  isActive: true,
  methodologyId: AYOBA_METHODOLOGY_ID,
  supportedScopes: ["Scope 1", "Scope 2"],
  requiredEvidenceTypes: [
    "Invoice",
    "Consumption report",
    "Fuel record",
    "Refrigerant record",
    "Other",
  ],
  verificationRules: ayobaPilotRules,
};
