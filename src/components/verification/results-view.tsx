"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import type { ClientRun } from "@/lib/client-run";
import type { SessionUser, VerificationResult } from "@/lib/types";
import { formatPercent, formatQuantity } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

const STATUSES = ["Verified", "Discrepancy", "Missing Evidence", "Manual Review", "Processing Error"];
const CATEGORY_ORDER = ["Stationary Combustion", "Mobile Combustion", "Fugitive Emissions", "Purchased Electricity"];
const RESULT_TABLE_HEADINGS = ["Facility", "Reported", "Evidence", "Difference", "System check", "Reviewer"];
const control = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#1d4e89]";

function ResultsTableColGroup() {
  return (
    <colgroup>
      <col style={{ width: "36%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "13%" }} />
      <col style={{ width: "15%" }} />
    </colgroup>
  );
}

const PILOT_WORKSPACE_USER: SessionUser = {
  id: "workspace-user",
  name: "Workspace user",
  email: "workspace@ghg-hub.local",
  role: "administrator",
};

function ayobaVerificationNote(steps: string[]): string | null {
  return steps.find((step) => step.startsWith("Ayoba verification")) ?? null;
}

function calculationDetailSteps(steps: string[]): string[] {
  return steps.filter(
    (step) => !step.startsWith("Ayoba verification") && !step.startsWith("Tolerance applied"),
  );
}

export function ResultsRoute() {
  const params = useParams<{ runId: string }>();
  return <ResultsView runId={params.runId} />;
}

export function ResultsView({ runId }: { runId: string }) {
  const [run, setRun] = useState<ClientRun | null>(null);
  const [user, setUser] = useState<SessionUser>(PILOT_WORKSPACE_USER);
  const [selected, setSelected] = useState<VerificationResult | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ scope: "All", category: "All", facility: "All", status: "All", search: "" });

  useEffect(() => {
    api<{ run: ClientRun }>(`/api/runs/${runId}`).then((data) => setRun(data.run)).catch((error: Error) => toast.error(error.message));
    api<{ user: SessionUser }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(PILOT_WORKSPACE_USER));
  }, [runId]);

  const facilities = useMemo(() => [...new Set(run?.results.map((result) => result.facilityName) ?? [])], [run]);
  const categories = useMemo(() => [...new Set(run?.results.map((result) => result.category) ?? [])], [run]);
  const visible = useMemo(() => {
    return (run?.results ?? []).filter((result) => {
      if (filters.scope !== "All" && result.scope !== filters.scope) return false;
      if (filters.category !== "All" && result.category !== filters.category) return false;
      if (filters.facility !== "All" && result.facilityName !== filters.facility) return false;
      if (filters.status !== "All" && result.automatedStatus !== filters.status) return false;
      const haystack = `${result.facilityName} ${result.category} ${result.consumptionType}`.toLowerCase();
      return haystack.includes(filters.search.toLowerCase());
    });
  }, [run, filters]);

  const visibleByCategory = useMemo(() => {
    const groups = new Map<string, VerificationResult[]>();
    for (const result of visible) {
      const bucket = groups.get(result.category) ?? [];
      bucket.push(result);
      groups.set(result.category, bucket);
    }
    const categories = [...groups.keys()].sort((left, right) => {
      const leftIndex = CATEGORY_ORDER.indexOf(left);
      const rightIndex = CATEGORY_ORDER.indexOf(right);
      if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
    return categories.map((category) => {
      const results = [...(groups.get(category) ?? [])].sort((left, right) =>
        left.facilityName.localeCompare(right.facilityName),
      );
      return { category, results };
    });
  }, [visible]);

  const canReview = user.role === "reviewer" || user.role === "administrator";

  async function act(action: "accept" | "flag" | "request_evidence" | "comment") {
    if (!selected || !run) return;
    if (!canReview && action !== "comment") {
      toast.error("Only a reviewer or administrator can record this decision.");
      return;
    }
    setBusy(true);
    const toastId = toast.loading("Saving reviewer decision…");
    try {
      const data = await api<{ run: ClientRun }>(`/api/runs/${run.id}/results/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      setRun(data.run);
      setSelected(null);
      setComment("");
      toast.success(
        action === "accept"
          ? "Accepted. The automated discrepancy status is unchanged."
          : action === "comment"
            ? "Comment saved."
            : "Review decision saved.",
        { id: toastId },
      );
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The review action could not be saved.", { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  if (!run) return <p className="text-sm text-slate-500">Loading verification results…</p>;

  return (
    <div>
      <PageHeader
        title={`${run.reportingMonth} ${run.reportingYear}`}
        description="System checks compare reported data to evidence; reviewer decisions are recorded separately. Open a row to see the calculation and the evidence it used."
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/runs/${run.id}/export/excel`}>Export verification sheet</a>
          </Button>
        }
      />
      {run.isDemonstration ? <p className="mb-4 text-sm text-slate-600">This run was loaded from the demonstration pack, not from an Ayoba submission.</p> : null}
      <Card className="mb-4">
        <CardContent className="grid gap-3 py-4 md:grid-cols-6">
          <label className="text-xs font-medium text-slate-500">OPCO<input className={control} value="Ayoba" readOnly /></label>
          <label className="text-xs font-medium text-slate-500">Month<input className={control} value={run.reportingMonth} readOnly /></label>
          <label className="text-xs font-medium text-slate-500">Year<input className={control} value={run.reportingYear} readOnly /></label>
          <label className="text-xs font-medium text-slate-500">Scope
            <select className={control} value={filters.scope} onChange={(event) => setFilters({ ...filters, scope: event.target.value })}>
              <option>All</option><option>Scope 1</option><option>Scope 2</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">Category
            <select className={control} value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
              <option>All</option>{categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">Status
            <select className={control} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option>All</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500 md:col-span-2">Facility
            <select className={control} value={filters.facility} onChange={(event) => setFilters({ ...filters, facility: event.target.value })}>
              <option>All</option>{facilities.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500 md:col-span-4">Search
            <input className={control} value={filters.search} placeholder="Search facility, category or consumption type" onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          </label>
        </CardContent>
      </Card>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-[#e4e9f0] bg-white px-4 py-8 text-sm text-slate-500">No results match these filters.</div>
      ) : (
        <div className="space-y-6">
          {visibleByCategory.map(({ category, results }) => (
            <section key={category} className="overflow-hidden rounded-xl border border-[#e4e9f0] bg-white">
              <h2 className="border-b border-[#e4e9f0] bg-slate-50 px-4 py-3 text-sm font-semibold text-[#0c2340]">{category}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] table-fixed text-left text-sm">
                  <ResultsTableColGroup />
                  <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {RESULT_TABLE_HEADINGS.map((heading) => (
                        <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr
                        key={result.id}
                        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                        onClick={() => {
                          setSelected(result);
                          setComment(result.reviewerComment ?? "");
                        }}
                      >
                        <td className="px-4 py-3 font-medium text-[#0c2340]">{result.facilityName}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatQuantity(result.reportedValue)} {result.unit}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {result.evidenceValue === null ? "—" : `${formatQuantity(result.evidenceValue)} ${result.unit}`}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {result.difference === null ? "—" : `${formatQuantity(result.difference)} ${result.unit}`}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={result.automatedStatus} compact />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge compact value={result.reviewerStatus ?? "Reviewer decision pending"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {selected ? (
            <div className="space-y-5 p-6 pb-10">
              <div className="space-y-2 border-b border-slate-200 pb-4">
                <SheetTitle className="text-left text-base leading-snug">{selected.facilityName}</SheetTitle>
                <SheetDescription className="text-left">
                  {selected.category} · {selected.reportingMonth} {selected.reportingYear}
                </SheetDescription>
                <div className="flex flex-wrap gap-2 pt-1">
                  <StatusBadge value={selected.automatedStatus} />
                  <StatusBadge value={selected.reviewerStatus ?? "Reviewer decision pending"} />
                </div>
              </div>

              <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comparison</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">Activity data (template)</dt>
                    <dd className="font-medium text-[#0c2340]">{formatQuantity(selected.reportedValue)} {selected.unit}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">Verified (invoice)</dt>
                    <dd className="font-medium text-[#0c2340]">
                      {selected.evidenceValue === null ? "—" : `${formatQuantity(selected.evidenceValue)} ${selected.unit}`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-2">
                    <dt className="text-slate-600">Difference</dt>
                    <dd className="font-medium text-[#0c2340]">
                      {selected.difference === null ? "—" : `${formatQuantity(selected.difference)} ${selected.unit}`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">% difference</dt>
                    <dd className="font-medium text-[#0c2340]">{formatPercent(selected.percentageDifference)}</dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[#0c2340]">Reported information</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-slate-500">OPCO</dt><dd>Ayoba</dd></div>
                  <div><dt className="text-slate-500">Scope</dt><dd>{selected.scope}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Facility</dt><dd>{selected.facilityName}</dd></div>
                  <div><dt className="text-slate-500">Category</dt><dd>{selected.category}</dd></div>
                  <div><dt className="text-slate-500">Period</dt><dd>{selected.reportingMonth} {selected.reportingYear}</dd></div>
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[#0c2340]">Supporting evidence</h3>
                {selected.matchedEvidence.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">No supporting evidence was matched.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {[...new Map(
                      selected.matchedEvidence.map((item) => {
                        const source = run.evidenceRecords.find((record) => record.id === item.id);
                        const documentId = source?.evidenceDocumentId ?? "";
                        return [documentId || item.documentName, { item, documentId }];
                      }),
                    ).values()].map(({ item, documentId }) => (
                      <li key={documentId || item.documentName} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <p className="font-medium text-[#0c2340]">{item.documentName}</p>
                        {documentId ? (
                          <a
                            className="mt-2 inline-block text-sm font-medium text-[#1d4e89] underline"
                            href={`/api/runs/${run.id}/evidence/${documentId}/file`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open invoice
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[#0c2340]">How this was verified</h3>
                <p className="mt-1 text-sm text-slate-600">{selected.ruleName}</p>
                {ayobaVerificationNote(selected.calculationSteps) ? (
                  <p className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">
                    {ayobaVerificationNote(selected.calculationSteps)}
                  </p>
                ) : null}
                {calculationDetailSteps(selected.calculationSteps).length > 0 ? (
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                    {calculationDetailSteps(selected.calculationSteps).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                ) : null}
                <p className="mt-3 text-xs text-slate-500">
                  Methodology {selected.methodologyVersion}
                  {selected.calculationSteps.find((step) => step.startsWith("Tolerance applied"))
                    ? ` · ${selected.calculationSteps.find((step) => step.startsWith("Tolerance applied"))}`
                    : null}
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[#0c2340]">Conclusion</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{selected.conclusion}</p>
              </section>

              <section className="space-y-3 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-[#0c2340]">Reviewer</h3>
                {selected.reviewedAt ? (
                  <p className="text-xs text-slate-600">
                    {selected.reviewerStatus ?? "Decision"} recorded by {selected.reviewedBy ?? "reviewer"}
                    {selected.reviewedAt ? ` · ${new Date(selected.reviewedAt).toLocaleString()}` : null}
                  </p>
                ) : null}
                {selected.reviewerComment?.trim() ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved comment</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{selected.reviewerComment}</p>
                  </div>
                ) : null}
                <label className="block text-xs font-medium text-slate-600">
                  {selected.reviewerComment?.trim() ? "Update comment" : "Add comment"}
                  <textarea
                    className="mt-1.5 min-h-20 w-full rounded-md border border-slate-300 bg-white p-3 text-sm"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Optional comment for the audit trail"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={!canReview || busy} onClick={() => act("accept")}>
                    {busy ? "Saving…" : "Accept"}
                  </Button>
                  <Button type="button" variant="outline" disabled={!canReview || busy} onClick={() => act("flag")}>
                    Flag
                  </Button>
                  <Button type="button" variant="outline" disabled={!canReview || busy} onClick={() => act("request_evidence")}>
                    Request evidence
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => act("comment")}>
                    Save comment
                  </Button>
                </div>
                {!canReview ? (
                  <p className="text-xs text-slate-500">Only a reviewer or administrator can accept, flag, or request evidence. Anyone can save a comment.</p>
                ) : null}
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
