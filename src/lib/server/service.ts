import type { Category, ConsumptionInput, EvidenceInput, Scope } from "@engine/shared/types";
import { getMethodologyForOpco, getOpcoConfiguration, listOpcoConfigurations } from "@engine/methodologies/registry";
import { DEFAULT_TOLERANCE, PILOT_DISCLAIMER } from "@engine/shared/types";
import { runVerification } from "@engine/core/verification-runner";
import { validateTolerance } from "@engine/shared/validators";
import { toClientRun, type ClientRun } from "../client-run";
import { buildDashboard } from "../dashboard";
import { buildVerificationAuditSummary } from "../verification-audit-summary";
import { buildVerificationLiveView } from "../verification-live";
import { extractConsumptionRecords, parseWorkbook } from "../excel/parse";
import type { AppliedSheetMapping } from "../excel/types";
import {
  emptyExtraction,
  extractEvidenceFromTable,
  tableFromCsv,
  tableFromWorkbook,
} from "../extraction/evidence";
import { deriveRunStatus, missingConsumptionFields, MONTHS } from "../records";
import {
  buildDemonstrationEvidenceWorkbook,
  buildDemonstrationInvoicePdf,
  buildDemonstrationTemplate,
} from "../samples";
import type {
  AppNotification,
  AuditLogEntry,
  ConsumptionRecord,
  EvidenceDocument,
  EvidenceRecord,
  ReviewerStatus,
  ScopeSelection,
  SessionUser,
  VerificationResult,
  VerificationRun,
} from "../types";
import { fileExtension, fileKind, safeFilename } from "../utils";
import type { ToleranceConfig as EngineTolerance } from "@engine/shared/types";
import { HttpError } from "./http";
import { applyAyobaVerificationPrep, methodologyNoteForResult, prepareAyobaVerification } from "./ayoba-verification";
import { extractPdfPages } from "./processor";
import path from "node:path";
import { rm } from "node:fs/promises";
import { readDatabase, readUpload, removeUpload, saveUpload, updateDatabase, uploadsRoot } from "./store";

const WRITERS = new Set(["administrator", "consultant"]);
const REVIEWERS = new Set(["administrator", "reviewer"]);

function assertWriter(user: SessionUser) {
  if (!WRITERS.has(user.role)) throw new HttpError(403, "Only a consultant or administrator can change verification data.");
}

function assertReviewer(user: SessionUser) {
  if (!REVIEWERS.has(user.role)) throw new HttpError(403, "Only a reviewer or administrator can record this decision.");
}

function snapshotMethodology(opcoId: string) {
  const methodology = getMethodologyForOpco(opcoId);
  if (!methodology) throw new HttpError(400, "No methodology is configured for the selected operating company.");
  return {
    methodology,
    snapshot: {
      id: methodology.id,
      name: methodology.name,
      version: methodology.version,
      approvalStatus: methodology.approvalStatus,
      disclaimer: methodology.disclaimer,
      rules: methodology.rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        type: rule.type,
        enabled: rule.enabled,
        isPilot: rule.isPilot,
        description: rule.description,
      })),
    },
  };
}

function audit(
  database: { auditLogs: AuditLogEntry[] },
  user: SessionUser,
  action: string,
  entityType: string,
  entityId: string,
  changeDetails: Record<string, unknown>,
) {
  database.auditLogs.unshift({
    id: crypto.randomUUID(),
    userId: user.id,
    userName: user.name,
    action,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    changeDetails,
  });
}

function notify(database: { notifications: AppNotification[] }, title: string, body: string, href?: string) {
  database.notifications.unshift({
    id: crypto.randomUUID(),
    title,
    body,
    createdAt: new Date().toISOString(),
    read: false,
    href,
  });
  database.notifications = database.notifications.slice(0, 40);
}

function mustRun(runs: VerificationRun[], id: string): VerificationRun {
  const run = runs.find((item) => item.id === id);
  if (!run) throw new HttpError(404, "Verification run not found.");
  return run;
}

function assertEditable(run: VerificationRun) {
  if (run.status === "Completed") {
    throw new HttpError(
      409,
      "This verification run is completed. Start a new run if you need to change files or re-run verification.",
    );
  }
}

function refreshStatuses(run: VerificationRun) {
  for (const document of run.evidenceDocuments) {
    const records = run.evidenceRecords.filter((record) => record.evidenceDocumentId === document.id);
    if (document.processingStatus === "Failed") continue;
    if (records.length === 0) {
      document.processingStatus = "Attached";
      continue;
    }
    if (!document.classificationConfirmed) {
      document.processingStatus = "Needs Review";
      continue;
    }
    document.processingStatus = records.some((record) => !record.extractionReliable && !record.confirmedByUser)
      ? "Needs Review"
      : "Processed";
  }
  run.status = deriveRunStatus(run);
  if (run.status === "Completed" && !run.completedAt) run.completedAt = new Date().toISOString();
}

async function parseEvidenceFile(filename: string, bytes: Buffer) {
  const extension = fileExtension(filename);
  if (extension === "xlsx" || extension === "xls") {
    return extractEvidenceFromTable({ documentName: filename, sheets: tableFromWorkbook(bytes) });
  }
  if (extension === "csv") {
    return extractEvidenceFromTable({ documentName: filename, sheets: tableFromCsv(bytes.toString("utf8")) });
  }
  if (extension === "pdf" || extension === "png" || extension === "jpg" || extension === "jpeg") {
    const documentType = /invoice/i.test(filename) ? "Invoice" : "Other";
    return {
      ...emptyExtraction(""),
      documentType,
      suggestedDocumentType: documentType,
      previewText: extension === "pdf" ? (await extractPdfPages(bytes)).map((page) => page.text).join("\n").slice(0, 4000) : null,
    };
  }
  throw new HttpError(400, "This file type is not supported.");
}

function placeholderEvidenceRecord(run: VerificationRun, document: EvidenceDocument): EvidenceRecord {
  return {
    id: crypto.randomUUID(),
    evidenceDocumentId: document.id,
    documentName: document.filename,
    facility: null,
    consumptionType: null,
    category: document.category || null,
    extractedValue: null,
    unit: null,
    reportingMonth: run.reportingMonth,
    reportingYear: run.reportingYear,
    reportingPeriodLabel: `${run.reportingMonth} ${run.reportingYear}`,
    sourceReference: "Supporting document",
    invoiceNumber: null,
    invoiceDate: null,
    supplierName: null,
    meterReading: null,
    confidence: 1,
    extractionReliable: false,
    confirmedByUser: true,
    calculationInputs: {},
    notes: null,
  };
}

function documentFromExtraction(
  runId: string,
  filename: string,
  bytes: Buffer,
  storagePath: string,
  extracted: Awaited<ReturnType<typeof parseEvidenceFile>>,
): { document: EvidenceDocument; records: EvidenceRecord[] } {
  const documentId = crypto.randomUUID();
  const document: EvidenceDocument = {
    id: documentId,
    verificationRunId: runId,
    filename,
    fileType: fileKind(filename),
    storagePath,
    sizeBytes: bytes.length,
    uploadedAt: new Date().toISOString(),
    processingStatus: "Attached",
    documentType: extracted.documentType,
    suggestedDocumentType: extracted.suggestedDocumentType,
    classificationConfidence: extracted.classificationConfidence,
    classificationConfirmed: true,
    reportingMonth: null,
    reportingYear: null,
    facility: null,
    category: null,
    previewText: extracted.previewText,
    processingNote: null,
  };
  const records: EvidenceRecord[] = extracted.records.map((record) => ({
    ...record,
    id: crypto.randomUUID(),
    evidenceDocumentId: documentId,
  }));
  return { document, records };
}

export async function getDashboard(options?: { reportingMonth?: string; reportingYear?: number }) {
  const database = await readDatabase();
  return buildDashboard(database.runs, options);
}

export async function getVerificationLive(reportingMonth: string, reportingYear: number) {
  const database = await readDatabase();
  return buildVerificationLiveView(database.runs, reportingMonth, reportingYear);
}

export async function getVerificationAuditSummary(options?: { reportingMonth?: string; reportingYear?: number }) {
  const database = await readDatabase();
  return buildVerificationAuditSummary(database.runs, options);
}

export async function getWorkspaceSettings() {
  const database = await readDatabase();
  return {
    settings: database.settings,
    opcos: listOpcoConfigurations().map((opco) => ({
      ...opco,
      region: database.settings.opcoRegions[opco.id] ?? opco.region,
    })),
    methodologies: listOpcoConfigurations().map((opco) => getMethodologyForOpco(opco.id)),
    persistence: process.env.SUPABASE_URL
      ? "Supabase credentials are present. Apply the SQL migration before use. This pilot still stores working papers in the local workspace."
      : "Local workspace store. Supabase is not configured.",
    disclaimer: PILOT_DISCLAIMER,
  };
}

export async function updateWorkspaceSettings(
  user: SessionUser,
  patch: { tolerance?: EngineTolerance; region?: string },
) {
  if (user.role !== "administrator") throw new HttpError(403, "Only an administrator can change these settings.");
  const database = await updateDatabase((current) => {
    if (patch.tolerance) {
      const errors = validateTolerance(patch.tolerance);
      if (errors.length > 0) throw new HttpError(400, errors.join(" "));
      current.settings.tolerance = patch.tolerance.mode === "exact" && patch.tolerance.approvalStatus === "pilot_default"
        ? DEFAULT_TOLERANCE
        : {
            ...patch.tolerance,
            approvalStatus: "configured_unapproved",
            label: "Configured by an administrator. This is not an approved KPMG tolerance.",
          };
    }
    if (patch.region !== undefined) {
      current.settings.opcoRegions.ayoba = patch.region.trim() || "Not configured";
    }
    audit(current, user, "Updated settings", "settings", "workspace", { ...patch });
  });
  return database.settings;
}

export async function listAudit(user: SessionUser) {
  if (user.role !== "administrator" && user.role !== "reviewer") {
    throw new HttpError(403, "Only a reviewer or administrator can view the audit log.");
  }
  const database = await readDatabase();
  return database.auditLogs.slice(0, 200);
}

export async function listNotifications() {
  const database = await readDatabase();
  return database.notifications;
}

export async function markNotificationsRead() {
  await updateDatabase((database) => {
    database.notifications.forEach((item) => {
      item.read = true;
    });
  });
}

export async function listRuns(): Promise<ClientRun[]> {
  const database = await readDatabase();
  return database.runs
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(toClientRun);
}

export async function getRun(id: string): Promise<ClientRun> {
  const database = await readDatabase();
  return toClientRun(mustRun(database.runs, id));
}

export async function createRun(
  user: SessionUser,
  input: { opcoId: string; reportingMonth: string; reportingYear: number; scopeSelection: ScopeSelection },
): Promise<ClientRun> {
  assertWriter(user);
  const opco = getOpcoConfiguration(input.opcoId);
  if (!opco || !opco.isActive) throw new HttpError(400, "Select an active operating company.");
  if (!MONTHS.includes(input.reportingMonth)) throw new HttpError(400, "Select a reporting month.");
  if (!Number.isInteger(input.reportingYear) || input.reportingYear < 2000 || input.reportingYear > 2100) {
    throw new HttpError(400, "Select a reporting year.");
  }
  const { snapshot } = snapshotMethodology(input.opcoId);
  const run: VerificationRun = {
    id: crypto.randomUUID(),
    opcoId: input.opcoId,
    reportingMonth: input.reportingMonth,
    reportingYear: input.reportingYear,
    scopeSelection: input.scopeSelection,
    methodologyId: snapshot.id,
    methodologyVersion: snapshot.version,
    methodologySnapshot: snapshot,
    toleranceSnapshot: null,
    status: "Draft",
    createdAt: new Date().toISOString(),
    completedAt: null,
    verifiedAt: null,
    createdBy: user.id,
    createdByName: user.name,
    reviewerName: null,
    isDemonstration: false,
    template: null,
    workbook: null,
    mappingConfirmed: false,
    recordsConfirmed: false,
    evidenceReviewConfirmed: false,
    consumptionRecords: [],
    evidenceDocuments: [],
    evidenceRecords: [],
    results: [],
  };
  await updateDatabase((database) => {
    database.runs.unshift(run);
    audit(database, user, "Created verification run", "verification_run", run.id, {
      opcoId: run.opcoId,
      period: `${run.reportingMonth} ${run.reportingYear}`,
      scope: run.scopeSelection,
    });
  });
  return toClientRun(run);
}

export async function uploadTemplate(user: SessionUser, runId: string, file: { name: string; bytes: Buffer }) {
  assertWriter(user);
  let workbook;
  try {
    workbook = parseWorkbook(file.bytes);
  } catch {
    throw new HttpError(400, "The workbook could not be read. Check that it is a valid Excel file.");
  }
  if (workbook.sheets.length === 0) {
    throw new HttpError(400, "No data rows were found. Check the column headings and try again.");
  }
  const storagePath = await saveUpload(runId, `${crypto.randomUUID()}-${safeFilename(file.name)}`, file.bytes);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    const extracted = workbook.needsMappingReview
      ? { records: [], excludedBecauseScope: 0 }
      : extractConsumptionRecords({
          workbook,
          opcoId: run.opcoId,
          reportingMonth: run.reportingMonth,
          reportingYear: run.reportingYear,
          scopeSelection: run.scopeSelection,
          sourceFile: file.name,
        });
    run.template = {
      filename: file.name,
      sizeBytes: file.bytes.length,
      uploadedAt: new Date().toISOString(),
      storagePath,
      validationStatus: workbook.needsMappingReview ? "Needs mapping review" : "Valid",
      validationMessage: workbook.needsMappingReview
        ? "Some columns could not be mapped with confidence. Review the mapping before verification."
        : `Extracted ${extracted.records.length} consumption records.${extracted.excludedBecauseScope ? ` ${extracted.excludedBecauseScope} rows were outside the selected scope.` : ""}`,
    };
    run.workbook = workbook;
    run.consumptionRecords = extracted.records;
    run.mappingConfirmed = !workbook.needsMappingReview;
    run.recordsConfirmed = false;
    run.evidenceReviewConfirmed = false;
    refreshStatuses(run);
    audit(current, user, "Uploaded data collection template", "verification_run", run.id, {
      filename: file.name,
      records: extracted.records.length,
      needsMappingReview: workbook.needsMappingReview,
    });
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function clearTemplate(user: SessionUser, runId: string) {
  assertWriter(user);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    if (run.template?.storagePath) {
      void removeUpload(run.template.storagePath);
    }
    run.template = null;
    run.workbook = null;
    run.consumptionRecords = [];
    run.mappingConfirmed = false;
    run.recordsConfirmed = false;
    run.evidenceReviewConfirmed = false;
    refreshStatuses(run);
    audit(current, user, "Cleared data collection template", "verification_run", run.id, {});
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function applyMapping(user: SessionUser, runId: string, applied: AppliedSheetMapping[]) {
  assertWriter(user);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    if (!run.workbook || !run.template) throw new HttpError(400, "Upload a data collection template first.");
    const extracted = extractConsumptionRecords({
      workbook: run.workbook,
      applied,
      opcoId: run.opcoId,
      reportingMonth: run.reportingMonth,
      reportingYear: run.reportingYear,
      scopeSelection: run.scopeSelection,
      sourceFile: run.template.filename,
    });
    run.consumptionRecords = extracted.records;
    run.mappingConfirmed = true;
    run.recordsConfirmed = false;
    run.template.validationStatus = extracted.records.length > 0 ? "Valid" : "Needs mapping review";
    run.template.validationMessage = extracted.records.length > 0
      ? `Mapping applied. ${extracted.records.length} records extracted.${extracted.excludedBecauseScope ? ` ${extracted.excludedBecauseScope} rows were outside the selected scope.` : ""}`
      : "The mapping did not produce any in-scope consumption records.";
    refreshStatuses(run);
    audit(current, user, "Updated Excel column mapping", "verification_run", run.id, {
      sheets: applied.map((sheet) => sheet.name),
      records: extracted.records.length,
    });
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function updateRecords(user: SessionUser, runId: string, incoming: ConsumptionRecord[]) {
  assertWriter(user);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    const changes: Record<string, unknown>[] = [];
    const next = run.consumptionRecords.flatMap((existing) => {
      const edited = incoming.find((record) => record.id === existing.id);
      if (!edited) {
        changes.push({ id: existing.id, removed: true });
        return [];
      }
      const updated: ConsumptionRecord = {
        ...existing,
        facilityName: edited.facilityName,
        scope: edited.scope,
        category: edited.category,
        consumptionType: edited.consumptionType,
        reportedConsumption: edited.reportedConsumption,
        unit: edited.unit,
        reportingMonth: edited.reportingMonth,
        reportingYear: edited.reportingYear,
        missingFields: [],
      };
      updated.missingFields = missingConsumptionFields(updated);
      const fieldChanges = (["facilityName", "scope", "category", "consumptionType", "reportedConsumption", "unit", "reportingMonth", "reportingYear"] as const)
        .filter((field) => existing[field] !== updated[field]);
      if (fieldChanges.length > 0) {
        changes.push({
          id: existing.id,
          fields: Object.fromEntries(fieldChanges.map((field) => [field, { from: existing[field], to: updated[field] }])),
        });
      }
      return [updated];
    });
    run.consumptionRecords = next;
    run.recordsConfirmed = false;
    refreshStatuses(run);
    if (changes.length > 0) {
      audit(current, user, "Corrected extracted consumption", "consumption_record", run.id, { changes });
    }
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function confirmRecords(user: SessionUser, runId: string) {
  assertWriter(user);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    if (run.consumptionRecords.length === 0) throw new HttpError(400, "Extract at least one consumption record before continuing.");
    const incomplete = run.consumptionRecords.filter((record) => record.missingFields.length > 0);
    if (incomplete.length > 0) {
      throw new HttpError(400, `${incomplete.length} record${incomplete.length === 1 ? "" : "s"} still ha${incomplete.length === 1 ? "s" : "ve"} missing or invalid fields.`);
    }
    run.recordsConfirmed = true;
    run.mappingConfirmed = true;
    refreshStatuses(run);
    audit(current, user, "Confirmed extracted consumption", "verification_run", run.id, {
      records: run.consumptionRecords.length,
    });
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function addEvidence(user: SessionUser, runId: string, file: { name: string; bytes: Buffer }) {
  assertWriter(user);
  const databaseBefore = await readDatabase();
  const existing = mustRun(databaseBefore.runs, runId);
  assertEditable(existing);
  const storagePath = await saveUpload(runId, `${crypto.randomUUID()}-${safeFilename(file.name)}`, file.bytes);
  let extracted;
  try {
    extracted = await parseEvidenceFile(file.name, file.bytes);
  } catch (error) {
    await removeUpload(storagePath);
    console.error(error);
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "The document could not be read. No values were inferred from it.");
  }
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    const created = documentFromExtraction(run.id, file.name, file.bytes, storagePath, extracted);
    if (created.records.length === 0) {
      created.records.push(placeholderEvidenceRecord(run, created.document));
    }
    run.evidenceDocuments.push(created.document);
    run.evidenceRecords.push(...created.records);
    run.evidenceReviewConfirmed = false;
    refreshStatuses(run);
    audit(current, user, "Uploaded supporting evidence", "evidence_document", created.document.id, {
      filename: file.name,
      records: created.records.length,
      status: created.document.processingStatus,
    });
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function updateEvidenceDocument(
  user: SessionUser,
  runId: string,
  documentId: string,
  patch: Partial<Pick<EvidenceDocument, "documentType" | "facility" | "category" | "reportingMonth" | "reportingYear" | "classificationConfirmed">>,
) {
  assertWriter(user);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    const document = run.evidenceDocuments.find((item) => item.id === documentId);
    if (!document) throw new HttpError(404, "Document not found.");
    const before = { ...document };
    if (patch.documentType !== undefined) document.documentType = patch.documentType;
    if (patch.facility !== undefined) document.facility = patch.facility;
    if (patch.category !== undefined) document.category = patch.category;
    if (patch.reportingMonth !== undefined) document.reportingMonth = patch.reportingMonth;
    if (patch.reportingYear !== undefined) document.reportingYear = patch.reportingYear;
    if (patch.classificationConfirmed) document.classificationConfirmed = true;
    refreshStatuses(run);
    audit(current, user, "Updated evidence classification", "evidence_document", document.id, { before, after: document });
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function deleteEvidenceDocument(user: SessionUser, runId: string, documentId: string) {
  assertWriter(user);
  const database = await readDatabase();
  const run = mustRun(database.runs, runId);
  assertEditable(run);
  const document = run.evidenceDocuments.find((item) => item.id === documentId);
  if (!document) throw new HttpError(404, "Document not found.");
  await removeUpload(document.storagePath);
  const updated = await updateDatabase((current) => {
    const target = mustRun(current.runs, runId);
    target.evidenceDocuments = target.evidenceDocuments.filter((item) => item.id !== documentId);
    target.evidenceRecords = target.evidenceRecords.filter((item) => item.evidenceDocumentId !== documentId);
    target.evidenceReviewConfirmed = false;
    refreshStatuses(target);
    audit(current, user, "Removed supporting evidence", "evidence_document", documentId, { filename: document.filename });
  });
  return toClientRun(mustRun(updated.runs, runId));
}

export async function createEvidenceRecord(user: SessionUser, runId: string, documentId: string) {
  assertWriter(user);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    const document = run.evidenceDocuments.find((item) => item.id === documentId);
    if (!document) throw new HttpError(404, "Document not found.");
    const record = placeholderEvidenceRecord(run, document);
    run.evidenceRecords.push(record);
    run.evidenceReviewConfirmed = false;
    refreshStatuses(run);
    audit(current, user, "Added evidence value for verification", "evidence_record", record.id, {
      documentId: document.id,
      filename: document.filename,
    });
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function updateEvidenceRecords(user: SessionUser, runId: string, incoming: EvidenceRecord[]) {
  assertWriter(user);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    const changes: Record<string, unknown>[] = [];
    run.evidenceRecords = run.evidenceRecords.map((existing) => {
      const edited = incoming.find((record) => record.id === existing.id);
      if (!edited) return existing;
      const changed = existing.extractedValue !== edited.extractedValue
        || existing.unit !== edited.unit
        || existing.facility !== edited.facility
        || existing.consumptionType !== edited.consumptionType
        || existing.reportingMonth !== edited.reportingMonth
        || existing.reportingYear !== edited.reportingYear;
      const updated: EvidenceRecord = {
        ...existing,
        facility: edited.facility,
        consumptionType: edited.consumptionType,
        category: edited.category,
        extractedValue: edited.extractedValue,
        unit: edited.unit,
        reportingMonth: edited.reportingMonth,
        reportingYear: edited.reportingYear,
        invoiceNumber: edited.invoiceNumber,
        confirmedByUser: existing.confirmedByUser || changed,
        extractionReliable: existing.extractionReliable || changed,
        confidence: changed ? 1 : existing.confidence,
        notes: changed ? "Corrected by a user before verification." : existing.notes,
      };
      if (changed) changes.push({ id: existing.id, from: existing.extractedValue, to: updated.extractedValue });
      return updated;
    });
    run.evidenceReviewConfirmed = false;
    refreshStatuses(run);
    if (changes.length > 0) {
      audit(current, user, "Corrected extracted evidence", "evidence_record", run.id, { changes });
    }
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function confirmEvidence(user: SessionUser, runId: string) {
  assertWriter(user);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    if (!run.recordsConfirmed) throw new HttpError(400, "Confirm the reported consumption before confirming evidence.");
    run.evidenceReviewConfirmed = true;
    refreshStatuses(run);
    audit(current, user, "Confirmed evidence review", "verification_run", run.id, {
      opcoId: run.opcoId,
      period: `${run.reportingMonth} ${run.reportingYear}`,
      documents: run.evidenceDocuments.length,
      evidenceRecords: run.evidenceRecords.length,
    });
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function verifyRun(user: SessionUser, runId: string) {
  assertWriter(user);
  const databaseBefore = await readDatabase();
  const runBefore = mustRun(databaseBefore.runs, runId);
  assertEditable(runBefore);
  if (!runBefore.recordsConfirmed || !runBefore.evidenceReviewConfirmed) {
    throw new HttpError(400, "Confirm the reported consumption and supporting evidence before running verification.");
  }
  const incomplete = runBefore.consumptionRecords.filter((record) => record.missingFields.length > 0);
  if (incomplete.length > 0) throw new HttpError(400, "Resolve missing consumption fields before verification.");
  const ayobaPrep = runBefore.opcoId === "ayoba" ? await prepareAyobaVerification(runBefore) : null;

  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    assertEditable(run);
    if (ayobaPrep) {
      applyAyobaVerificationPrep(run, ayobaPrep);
    }
    run.results = [];
    run.verifiedAt = null;
    const { methodology, snapshot } = snapshotMethodology(run.opcoId);
    const tolerance = current.settings.tolerance;
    const records: ConsumptionInput[] = run.consumptionRecords.map((record) => ({
      id: record.id,
      facilityName: record.facilityName,
      scope: record.scope as Scope,
      category: record.category as Category,
      consumptionType: record.consumptionType,
      reportedConsumption: record.reportedConsumption as number,
      unit: record.unit,
      reportingMonth: record.reportingMonth,
      reportingYear: record.reportingYear,
    }));
    const evidence: EvidenceInput[] = run.evidenceRecords.map((record) => ({
      id: record.id,
      documentId: record.evidenceDocumentId,
      documentName: record.documentName,
      facilityName: record.facility,
      consumptionType: record.consumptionType,
      category: record.category,
      extractedValue: record.extractedValue,
      unit: record.unit,
      reportingMonth: record.reportingMonth,
      reportingYear: record.reportingYear,
      sourceReference: record.sourceReference,
      invoiceNumber: record.invoiceNumber,
      confidence: record.confirmedByUser ? 1 : record.confidence,
      extractionReliable: record.extractionReliable || record.confirmedByUser,
      calculationInputs: record.calculationInputs,
    }));
    const outputs = runVerification({ methodology, tolerance, records, evidence });
    run.results = outputs.map((output) => {
      const source = run.consumptionRecords.find((record) => record.id === output.consumptionRecordId);
      const ayobaNote = ayobaPrep && source ? methodologyNoteForResult(ayobaPrep, source.category) : null;
      const result: VerificationResult = {
        id: crypto.randomUUID(),
        consumptionRecordId: output.consumptionRecordId,
        ruleId: output.ruleId,
        ruleName: output.ruleName,
        methodologyId: output.methodologyId,
        methodologyVersion: output.methodologyVersion,
        isPilotResult: output.isPilotResult,
        facilityName: source?.facilityName ?? "",
        scope: source?.scope ?? "",
        category: source?.category ?? "",
        consumptionType: source?.consumptionType ?? "",
        reportingMonth: source?.reportingMonth ?? run.reportingMonth,
        reportingYear: source?.reportingYear ?? run.reportingYear,
        reportedValue: output.reportedValue,
        evidenceValue: output.evidenceValue,
        difference: output.difference,
        percentageDifference: output.percentageDifference,
        unit: output.unit,
        automatedStatus: output.automatedStatus,
        reviewerStatus: null,
        reviewerComment: null,
        explanation: output.explanation,
        conclusion: output.conclusion,
        calculationSteps: [
          ...(ayobaNote ? [ayobaNote] : []),
          ...(output.calculation?.steps ?? []),
          `Tolerance applied: ${tolerance.label}`,
        ],
        checks: output.checks,
        matchedEvidence: output.matchedEvidence,
        reviewedBy: null,
        reviewedAt: null,
      };
      return result;
    });
    run.methodologySnapshot = snapshot;
    run.methodologyVersion = snapshot.version;
    run.toleranceSnapshot = tolerance;
    run.verifiedAt = new Date().toISOString();
    refreshStatuses(run);
    audit(current, user, "Ran pilot verification", "verification_run", run.id, {
      opcoId: run.opcoId,
      period: `${run.reportingMonth} ${run.reportingYear}`,
      methodologyVersion: run.methodologyVersion,
      results: run.results.length,
    });
    notify(
      current,
      "Verification complete",
      `${getOpcoConfiguration(run.opcoId)?.name ?? "OPCO"} ${run.reportingMonth} ${run.reportingYear} has pilot results ready for review.`,
      `/verification/${run.id}`,
    );
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function resetVerification(
  user: SessionUser,
  runId: string,
  options?: { demo?: boolean },
) {
  assertWriter(user);
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    if (run.status === "Completed" && !options?.demo) {
      throw new HttpError(409, "This verification run is completed. Start a new run from the workflow instead.");
    }
    if (run.results.length === 0 && !options?.demo) {
      throw new HttpError(400, "This run does not have verification results to clear.");
    }
    run.results = [];
    run.verifiedAt = null;
    run.completedAt = null;
    run.evidenceReviewConfirmed = false;
    run.reviewerName = null;
    refreshStatuses(run);
    audit(
      current,
      user,
      options?.demo ? "Cleared verification results (demo reset)" : "Cleared verification results",
      "verification_run",
      run.id,
      {
        period: `${run.reportingMonth} ${run.reportingYear}`,
        opcoId: run.opcoId,
      },
    );
  });
  return toClientRun(mustRun(database.runs, runId));
}

async function deleteRunUploads(run: VerificationRun) {
  if (run.template?.storagePath) {
    await removeUpload(run.template.storagePath);
  }
  for (const document of run.evidenceDocuments) {
    await removeUpload(document.storagePath);
  }
  await rm(path.join(uploadsRoot(), run.id), { recursive: true, force: true });
}

export async function resetAyobaDemoVerification(
  user: SessionUser,
  reportingMonth: string,
  reportingYear: number,
) {
  assertWriter(user);
  const database = await readDatabase();
  const targets = database.runs.filter(
    (item) =>
      item.opcoId === "ayoba" &&
      item.reportingMonth === reportingMonth &&
      item.reportingYear === reportingYear,
  );
  if (targets.length === 0) {
    throw new HttpError(404, "No Ayoba verification run exists for this reporting period.");
  }
  for (const run of targets) {
    await deleteRunUploads(run);
  }
  await updateDatabase((current) => {
    current.runs = current.runs.filter(
      (item) =>
        !(
          item.opcoId === "ayoba" &&
          item.reportingMonth === reportingMonth &&
          item.reportingYear === reportingYear
        ),
    );
    audit(current, user, "Cleared verification results (demo reset)", "verification_run", "ayoba", {
      period: `${reportingMonth} ${reportingYear}`,
      opcoId: "ayoba",
      runsRemoved: targets.length,
    });
  });
  return { removed: targets.length, reportingMonth, reportingYear };
}

export async function reviewResult(
  user: SessionUser,
  runId: string,
  resultId: string,
  input: { action: "accept" | "flag" | "request_evidence" | "comment"; comment?: string },
) {
  if (input.action === "comment") {
    if (!input.comment?.trim()) throw new HttpError(400, "Enter a comment.");
  } else {
    assertReviewer(user);
  }
  const decisions: Record<typeof input.action, ReviewerStatus | null> = {
    accept: "Accepted",
    flag: "Flagged for Follow-up",
    request_evidence: "Additional Evidence Requested",
    comment: null,
  };
  const database = await updateDatabase((current) => {
    const run = mustRun(current.runs, runId);
    const result = run.results.find((item) => item.id === resultId);
    if (!result) throw new HttpError(404, "Verification result not found.");
    if (input.comment !== undefined) result.reviewerComment = input.comment.trim();
    const decision = decisions[input.action];
    if (decision) {
      result.reviewerStatus = decision;
      result.reviewedBy = user.name;
      result.reviewedAt = new Date().toISOString();
      run.reviewerName = user.name;
    }
    refreshStatuses(run);
    audit(current, user, "Recorded reviewer action", "verification_result", result.id, {
      runId: run.id,
      opcoId: run.opcoId,
      period: `${run.reportingMonth} ${run.reportingYear}`,
      facilityName: result.facilityName,
      category: result.category,
      action: input.action,
      reviewerStatus: result.reviewerStatus,
      comment: result.reviewerComment,
      automatedStatus: result.automatedStatus,
    });
    if (input.action === "flag" || input.action === "request_evidence") {
      notify(current, "Reviewer follow-up", `${result.facilityName} / ${result.consumptionType}: ${result.reviewerStatus}.`, `/verification/${run.id}`);
    }
  });
  return toClientRun(mustRun(database.runs, runId));
}

export async function readEvidenceFile(runId: string, documentId: string) {
  const database = await readDatabase();
  const run = mustRun(database.runs, runId);
  const document = run.evidenceDocuments.find((item) => item.id === documentId);
  if (!document) throw new HttpError(404, "Document not found.");
  const bytes = await readUpload(document.storagePath);
  return { document, bytes };
}

export async function createDemonstrationRun(user: SessionUser): Promise<ClientRun> {
  assertWriter(user);
  const template = buildDemonstrationTemplate();
  const evidence = buildDemonstrationEvidenceWorkbook();
  const invoice = await buildDemonstrationInvoicePdf();
  const created = await createRun(user, {
    opcoId: "ayoba",
    reportingMonth: "September",
    reportingYear: 2026,
    scopeSelection: "Both",
  });
  await uploadTemplate(user, created.id, { name: "Ayoba-demonstration-template.xlsx", bytes: template });
  const database = await readDatabase();
  const run = mustRun(database.runs, created.id);
  if (run.consumptionRecords.some((record) => record.missingFields.length > 0)) {
    throw new HttpError(500, "The demonstration template did not extract cleanly.");
  }
  await confirmRecords(user, created.id);
  await addEvidence(user, created.id, { name: "Ayoba-demonstration-evidence.xlsx", bytes: evidence });
  await addEvidence(user, created.id, { name: "Ayoba-demonstration-electricity-invoice.pdf", bytes: invoice });
  await updateDatabase((current) => {
    const target = mustRun(current.runs, created.id);
    target.isDemonstration = true;
    target.evidenceDocuments.forEach((document) => {
      document.classificationConfirmed = true;
    });
    refreshStatuses(target);
  });
  await confirmEvidence(user, created.id);
  return verifyRun(user, created.id);
}

