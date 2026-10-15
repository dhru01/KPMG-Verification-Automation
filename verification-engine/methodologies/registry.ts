import type { Methodology, OPCOConfiguration } from "../shared/types";
import { ayobaConfiguration, ayobaMethodology } from "./ayoba/config";

const methodologies: Methodology[] = [ayobaMethodology];
const opcos: OPCOConfiguration[] = [ayobaConfiguration];

export function listMethodologies(): Methodology[] {
  return methodologies.map(cloneMethodology);
}

export function getMethodology(id: string): Methodology | undefined {
  const methodology = methodologies.find((item) => item.id === id);
  return methodology ? cloneMethodology(methodology) : undefined;
}

export function getMethodologyForOpco(opcoId: string): Methodology | undefined {
  const opco = opcos.find((item) => item.id === opcoId);
  if (!opco) return undefined;
  return getMethodology(opco.methodologyId);
}

export function listOpcoConfigurations(): OPCOConfiguration[] {
  return opcos.map((opco) => ({
    ...opco,
    supportedScopes: [...opco.supportedScopes],
    requiredEvidenceTypes: [...opco.requiredEvidenceTypes],
    verificationRules: opco.verificationRules.map((rule) => ({ ...rule, parameters: { ...rule.parameters } })),
  }));
}

export function getOpcoConfiguration(opcoId: string): OPCOConfiguration | undefined {
  return listOpcoConfigurations().find((opco) => opco.id === opcoId);
}

function cloneMethodology(methodology: Methodology): Methodology {
  return {
    ...methodology,
    rules: methodology.rules.map((rule) => ({ ...rule, parameters: { ...rule.parameters } })),
  };
}
