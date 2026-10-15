"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, api, uploadFile } from "@/lib/api";
import type { ClientRun } from "@/lib/client-run";
import { FIELD_KEYS, FIELD_LABELS, type FieldKey } from "@/lib/excel/types";
import { missingConsumptionFields, MONTHS } from "@/lib/records";
import { activitySectionLabel, activitySectionSortIndex } from "@/lib/excel/collection-template";
import type { Category, ConsumptionRecord, ScopeSelection } from "@/lib/types";
import { formatBytes, formatTimestamp } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const STEPS = ["Reporting period", "Data template", "Reported consumption", "Supporting evidence", "Verification"];
const YEARS = [2024, 2025, 2026, 2027];
const CATEGORIES: Category[] = ["Stationary Combustion", "Mobile Combustion", "Fugitive Emissions", "Purchased Electricity"];
const control = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#1d4e89] focus:ring-2 focus:ring-[#1d4e89]/20";

function stepFromRun(run: ClientRun | null): number {
  if (!run) return 1;
  if (run.results.length > 0 || run.evidenceReviewConfirmed) return 5;
  if (run.recordsConfirmed) return 4;
  if (run.consumptionRecords.length > 0) return 3;
  if (run.template) return 2;
  return 2;
}

export function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const [run, setRun] = useState<ClientRun | null>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [month, setMonth] = useState("September");
  const [year, setYear] = useState(2026);
  const [scope, setScope] = useState<ScopeSelection>("Both");
  const [records, setRecords] = useState<ConsumptionRecord[]>([]);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const verificationStartedForRun = useRef<string | null>(null);

  useEffect(() => {
    const id = params.get("run");
    if (!id) return;
    api<{ run: ClientRun }>(`/api/runs/${id}`)
      .then((data) => {
        setRun(data.run);
        setRecords(data.run.consumptionRecords);
        setMonth(data.run.reportingMonth);
        setYear(data.run.reportingYear);
        setScope(data.run.scopeSelection);
        const stepParam = params.get("step");
        const requested = stepParam ? Number(stepParam) : NaN;
        const stepNumber =
          Number.isFinite(requested) && requested >= 1 && requested <= 5 ? requested : stepFromRun(data.run);
        setStep(stepNumber);
      })
      .catch((error: Error) => toast.error(error.message));
  }, [params]);

  function remember(next: ClientRun) {
    setRun(next);
    setRecords(next.consumptionRecords);
    localStorage.setItem("ghg-hub-opco", "Ayoba");
    localStorage.setItem("ghg-hub-period", `${next.reportingMonth} ${next.reportingYear}`);
  }

  function goToStep(number: number, activeRun: ClientRun | null = run) {
    if (number > 1 && !activeRun) {
      toast.error("Complete step 1 first to start a verification run.");
      return;
    }
    if (number !== 5 && !activeRun?.results.length) {
      verificationStartedForRun.current = null;
    }
    setStep(number);
    if (activeRun && number >= 1 && number <= 5) {
      router.replace(`/verification/new?run=${activeRun.id}&step=${number}`);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const data = await api<{ run: ClientRun }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ opcoId: "ayoba", reportingMonth: month, reportingYear: year, scopeSelection: scope }),
      });
      remember(data.run);
      goToStep(2, data.run);
      router.replace(`/verification/new?run=${data.run.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The run could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function onTemplate(file: File) {
    if (!run) return;
    setBusy(true);
    setProgress(0);
    try {
      const data = await uploadFile(`/api/runs/${run.id}/template`, file, setProgress);
      remember(data.run);
      toast.success(data.run.template?.validationMessage || "Template uploaded.");
      if (!data.run.workbook?.sheets.some((sheet) => sheet.suggestedMapping.facilityName.confidence < 0.74)) goToStep(3);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function clearUploadedTemplate() {
    if (!run) return;
    if (!window.confirm("Clear the uploaded template and all extracted consumption records?")) return;
    setBusy(true);
    try {
      const data = await api<{ run: ClientRun }>(`/api/runs/${run.id}/template`, { method: "DELETE" });
      remember(data.run);
      goToStep(2);
      toast.success("Template and extracted records cleared.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The template could not be cleared.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping(sheets: { name: string; mapping: Record<FieldKey, string | null>; defaults: { scope: string; category: string } }[]) {
    if (!run) return;
    setBusy(true);
    try {
      const data = await api<{ run: ClientRun }>(`/api/runs/${run.id}/mapping`, {
        method: "POST",
        body: JSON.stringify({ sheets }),
      });
      remember(data.run);
      goToStep(3);
      toast.success("Column mapping applied.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Mapping could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRecords() {
    if (!run) return;
    setBusy(true);
    try {
      const data = await api<{ run: ClientRun }>(`/api/runs/${run.id}/records`, {
        method: "PATCH",
        body: JSON.stringify({ records }),
      });
      remember(data.run);
      toast.success("Corrections saved to the audit log.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Corrections could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReported() {
    if (!run) return;
    setBusy(true);
    try {
      const saved = await api<{ run: ClientRun }>(`/api/runs/${run.id}/records`, {
        method: "PATCH",
        body: JSON.stringify({ records }),
      });
      remember(saved.run);
      const data = await api<{ run: ClientRun }>(`/api/runs/${run.id}/records/confirm`, { method: "POST" });
      remember(data.run);
      goToStep(4);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Confirm the missing fields first.");
    } finally {
      setBusy(false);
    }
  }

  async function onEvidence(files: FileList) {
    if (!run) return;
    setBusy(true);
    try {
      let latest = run;
      for (const file of Array.from(files)) {
        setProgress(0);
        const data = await uploadFile(`/api/runs/${latest.id}/evidence`, file, setProgress);
        latest = data.run;
      }
      remember(latest);
      toast.success("Files uploaded. Select Run verification when you are ready to continue.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Evidence upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function removeDocument(documentId: string) {
    if (!run || !window.confirm("Remove this document and its extracted values?")) return;
    try {
      const data = await api<{ run: ClientRun }>(`/api/runs/${run.id}/evidence/${documentId}`, { method: "DELETE" });
      remember(data.run);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The document could not be removed.");
    }
  }

  async function clearVerificationResults() {
    if (!run) return;
    if (
      !window.confirm(
        "Clear verification results for this run? Your template, reported consumption, and uploaded evidence stay in place. You can run verification again after reviewing supporting evidence.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const data = await api<{ run: ClientRun }>(`/api/runs/${run.id}/verification/reset`, { method: "POST" });
      remember(data.run);
      verificationStartedForRun.current = null;
      goToStep(4);
      toast.success("Verification results cleared. Update evidence if needed, then run verification again.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Verification results could not be cleared.");
    } finally {
      setBusy(false);
    }
  }

  function startNewVerification() {
    if (
      run?.results.length
      && !window.confirm("Start a new verification? This run remains in history with its current results.")
    ) {
      return;
    }
    verificationStartedForRun.current = null;
    setRun(null);
    setRecords([]);
    setStep(1);
    router.replace("/verification/new");
    toast.message("Start a new reporting period or continue with a fresh run.");
  }

  async function runVerification() {
    if (!run) return;
    if (run.evidenceDocuments.length === 0) {
      toast.error("Upload at least one supporting file before running verification.");
      goToStep(4);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/runs/${run.id}/evidence/confirm`, { method: "POST" });
      const data = await api<{ run: ClientRun }>(`/api/runs/${run.id}/verify`, { method: "POST" });
      remember(data.run);
      toast.success("Verification complete. Review the results or go back to earlier steps if you need to change files.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Verification could not be completed.");
      verificationStartedForRun.current = null;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (step !== 5 || !run || run.results.length > 0 || busy) return;
    if (verificationStartedForRun.current === run.id) return;
    verificationStartedForRun.current = run.id;
    void runVerification();
  }, [step, run, busy]);

  const missing = records.filter((record) => missingConsumptionFields(record).length > 0).length;
  const locked = Boolean(run?.results.length);
  const needsMapping = run?.template?.validationStatus === "Needs mapping review";
  const extractionLooksWrong = records.length > 0 && missing === records.length;

  return (
    <div>
      <PageHeader
        title="New verification"
        description="Upload the monthly template, confirm reported consumption, add supporting files, then run verification using the configured OPCO methodology."
        descriptionClassName="max-w-none"
      />
      <ol className="my-6 grid gap-2 md:grid-cols-5">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const reachable = number === 1 || Boolean(run);
          return (
            <li key={label}>
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                  active
                    ? "border-[#1d4e89] bg-white text-[#0c2340]"
                    : reachable
                      ? "border-transparent bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white"
                      : "border-transparent bg-white/50 text-slate-400"
                }`}
                onClick={() => reachable && !busy && goToStep(number)}
                disabled={!reachable || busy}
                aria-current={active ? "step" : undefined}
              >
                <span className="block text-xs font-medium">Step {number}</span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <Card>
          <CardHeader><CardTitle>Selected OPCO: Ayoba</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Reporting month
              <select className={`${control} mt-1.5`} value={month} onChange={(event) => setMonth(event.target.value)}>
                {MONTHS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Reporting year
              <select className={`${control} mt-1.5`} value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {YEARS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <div className="md:col-span-3 flex flex-wrap gap-2">
              {run ? (
                <Button type="button" disabled={busy} onClick={() => goToStep(2)}>Continue to data template</Button>
              ) : (
                <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Continue"}</Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && run ? (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Upload the data collection template</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                Upload your monthly data collection workbook (XLSX or XLS). Activity is read from the Stationary combustion, Mobile combustion,
                Fugitive emissions, Electricity (Grid), Electricity (IPP) and Onsite Renewable tabs using the Facility, Quantity and Quantity unit columns.
                Other tabs are ignored.
              </p>
              <input
                ref={templateInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={busy || locked}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onTemplate(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                disabled={busy || locked}
                onClick={() => templateInputRef.current?.click()}
              >
                {busy && progress !== null ? `Uploading… ${progress}%` : run.template ? "Replace template file" : "Choose Excel file"}
              </Button>
              {progress !== null ? <p className="text-sm text-slate-600">Uploading… {progress}%</p> : null}
              {run.template ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-slate-500">File name</dt><dd className="font-medium">{run.template.filename}</dd></div>
                  <div><dt className="text-slate-500">File size</dt><dd className="font-medium">{formatBytes(run.template.sizeBytes)}</dd></div>
                  <div><dt className="text-slate-500">Uploaded</dt><dd className="font-medium">{formatTimestamp(run.template.uploadedAt)}</dd></div>
                  <div><dt className="text-slate-500">Validation</dt><dd className="mt-1"><StatusBadge value={run.template.validationStatus} /></dd></div>
                </dl>
              ) : null}
              {run.template ? <p className="text-sm text-slate-600">{run.template.validationMessage}</p> : null}
              <div className="flex flex-wrap gap-2">
                {run.template ? (
                  <Button type="button" variant="outline" disabled={busy || locked} onClick={clearUploadedTemplate}>
                    Clear template
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
          {run.workbook && needsMapping ? (
            <MappingEditor
              run={run}
              disabled={locked || busy}
              onApply={saveMapping}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy || locked} onClick={() => goToStep(1)}>Back</Button>
            {run.consumptionRecords.length > 0 && !needsMapping ? (
              <Button type="button" onClick={() => goToStep(3)}>Review extracted records</Button>
            ) : null}
            {run.recordsConfirmed ? (
              <Button type="button" variant="outline" onClick={() => goToStep(4)}>Supporting evidence</Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 3 && run ? (
        <Card>
          <CardHeader><CardTitle>Review extracted consumption</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {needsMapping ? (
              <p className="text-sm text-amber-900">
                Mapping is required on the data template step. Map Facility, Quantity and Quantity unit for each activity tab, then apply mapping before reviewing records here.
              </p>
            ) : extractionLooksWrong ? (
              <p className="text-sm text-amber-900">
                These rows do not look like activity data. Use Clear template, re-upload the workbook, and check that each activity tab has Facility, Quantity and Quantity unit columns.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                {missing > 0
                  ? `${missing} record${missing === 1 ? "" : "s"} still need attention.`
                  : "Values were read automatically from the activity tabs. Check anything that looks wrong, then confirm."}
              </p>
            )}
            <RecordTable records={records} disabled={locked} onChange={setRecords} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || locked} onClick={() => goToStep(2)}>Back</Button>
              <Button type="button" variant="outline" onClick={clearUploadedTemplate} disabled={busy || locked}>
                Clear template
              </Button>
              <Button variant="outline" onClick={saveRecords} disabled={busy || locked}>Save corrections</Button>
              <Button onClick={confirmReported} disabled={busy || locked || missing > 0}>Confirm reported data</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 && run ? (
        <Card>
          <CardHeader><CardTitle>Upload supporting evidence</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6">
              <p className="text-sm font-medium text-[#0c2340]">Upload supporting documents</p>
              <p className="mt-1 text-pretty text-sm text-slate-600">
                Upload the monthly utility invoice (usually one PDF). When you run verification, Ayoba electricity is checked by summing Consumption values on the invoice and comparing the total to the collection template.
              </p>
              <input
                ref={evidenceInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
                className="hidden"
                disabled={busy || locked}
                onChange={(event) => {
                  if (event.target.files) onEvidence(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                className="mt-4"
                disabled={busy || locked}
                onClick={() => evidenceInputRef.current?.click()}
              >
                {busy && progress !== null ? `Uploading… ${progress}%` : "Add files"}
              </Button>
            </div>
            {run.evidenceDocuments.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {run.evidenceDocuments.map((document) => (
                  <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                    <a className="font-medium text-[#1d4e89] underline" href={`/api/runs/${run.id}/evidence/${document.id}/file`} target="_blank" rel="noreferrer">
                      {document.filename}
                    </a>
                    <Button variant="danger" size="sm" disabled={locked} onClick={() => removeDocument(document.id)}>Remove</Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => goToStep(3)}>Back</Button>
              {run.evidenceDocuments.length > 0 ? (
                <Button type="button" disabled={busy || locked} onClick={() => goToStep(5)}>
                  Run verification
                </Button>
              ) : null}
              {run.results.length > 0 ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => router.push(`/verification/${run.id}`)}>
                  View verification results
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 5 && run ? (
        <Card>
          <CardHeader><CardTitle>Verification</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {run.results.length > 0 ? (
              <>
                <p className="text-sm text-slate-600">
                  Verification has finished. Open the results table for filters and exports, or use the steps above to review earlier parts of this run.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => router.push(`/verification/${run.id}`)}>View verification results</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => goToStep(4)}>
                    Back to supporting evidence
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => goToStep(3)}>
                    Back to reported consumption
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={clearVerificationResults}>
                    Clear verification results
                  </Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={startNewVerification}>
                    Start new verification
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  {busy
                    ? "Running verification using the methodology and tolerance configured for this OPCO…"
                    : "Starting verification…"}
                </p>
                <Button type="button" variant="outline" disabled={busy || locked} onClick={() => goToStep(4)}>
                  Back to supporting evidence
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function MappingEditor({
  run,
  disabled,
  onApply,
}: {
  run: ClientRun;
  disabled: boolean;
  onApply: (sheets: { name: string; mapping: Record<FieldKey, string | null>; defaults: { scope: string; category: string } }[]) => void;
}) {
  const initial = useMemo(() => run.workbook?.sheets.map((sheet) => ({
    name: sheet.name,
    mapping: Object.fromEntries(FIELD_KEYS.map((field) => [field, sheet.suggestedMapping[field].column])) as Record<FieldKey, string | null>,
    defaults: { ...sheet.sheetDefaults },
  })) ?? [], [run.workbook]);
  const [sheets, setSheets] = useState(initial);
  useEffect(() => setSheets(initial), [initial]);
  if (!run.workbook) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Column mapping</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-slate-600">
          Automatic mapping could not find Facility, Quantity and Quantity unit on every activity tab. Set those three columns below, then apply mapping.
        </p>
        {run.workbook.sheets.map((sheet, sheetIndex) => (
          <div key={sheet.name} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium text-[#0c2340]">{sheet.name}</h3>
              <span className="text-xs text-slate-500">{sheet.rowCount} data rows · header row {sheet.headerRowNumber}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {FIELD_KEYS.map((field) => (
                <label key={field} className="text-xs font-medium text-slate-600">{FIELD_LABELS[field]}
                  <select
                    className={`${control} mt-1`}
                    disabled={disabled}
                    value={sheets[sheetIndex]?.mapping[field] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value || null;
                      setSheets((current) => current.map((item, index) => index === sheetIndex ? { ...item, mapping: { ...item.mapping, [field]: value } } : item));
                    }}
                  >
                    <option value="">Not mapped</option>
                    {sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        ))}
        <Button disabled={disabled} onClick={() => onApply(sheets)}>Apply mapping</Button>
      </CardContent>
    </Card>
  );
}

function RecordTable({ records, disabled, onChange }: { records: ConsumptionRecord[]; disabled: boolean; onChange: (records: ConsumptionRecord[]) => void }) {
  const sections = useMemo(() => {
    const bySheet = new Map<string, ConsumptionRecord[]>();
    for (const record of records) {
      const key = record.sourceSheet || "Unknown";
      const group = bySheet.get(key) ?? [];
      group.push(record);
      bySheet.set(key, group);
    }
    return [...bySheet.entries()].sort(([left], [right]) => {
      const order = activitySectionSortIndex(left) - activitySectionSortIndex(right);
      return order !== 0 ? order : left.localeCompare(right);
    });
  }, [records]);

  function update(id: string, patch: Partial<ConsumptionRecord>) {
    onChange(records.map((record) => {
      if (record.id !== id) return record;
      const next = { ...record, ...patch };
      next.missingFields = missingConsumptionFields(next);
      return next;
    }));
  }

  if (records.length === 0) return <p className="text-sm text-slate-500">No consumption records extracted yet.</p>;

  return (
    <div className="space-y-8">
      {sections.map(([sourceSheet, sectionRecords]) => {
        const sample = sectionRecords[0];
        const title = activitySectionLabel(sourceSheet, sample?.category ?? "");
        const scope = sample?.scope;
        const duplicateTitle = sections.filter(([name]) => activitySectionLabel(name, sample?.category ?? "") === title).length > 1;
        const subtitleParts = [
          scope || null,
          duplicateTitle ? sourceSheet : null,
          `${sectionRecords.length} record${sectionRecords.length === 1 ? "" : "s"}`,
        ].filter(Boolean);
        const subtitle = subtitleParts.join(" · ");

        return (
          <section key={sourceSheet} className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-[#0c2340]">{title}</h3>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#e4e9f0]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>{["Facility", "Reported", "Unit", "Cell", ""].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {sectionRecords.map((record) => (
                    <tr key={record.id} className="border-t border-slate-100">
                      <td className="px-3 py-2"><input className={control} disabled={disabled} value={record.facilityName} onChange={(event) => update(record.id, { facilityName: event.target.value })} /></td>
                      <td className="px-3 py-2"><input className={control} disabled={disabled} value={record.reportedConsumption ?? ""} onChange={(event) => update(record.id, { reportedConsumption: event.target.value === "" ? null : Number(event.target.value) })} /></td>
                      <td className="px-3 py-2"><input className={control} disabled={disabled} value={record.unit} onChange={(event) => update(record.id, { unit: event.target.value })} /></td>
                      <td className="px-3 py-2 text-xs text-slate-500">{record.sourceCell}</td>
                      <td className="px-3 py-2">{missingConsumptionFields(record).length > 0 ? <span className="text-xs text-rose-700">{missingConsumptionFields(record).join(", ")}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

