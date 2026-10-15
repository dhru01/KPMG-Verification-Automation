"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { parsePeriodLabel, type DashboardData } from "@/lib/dashboard";
import { MONTHS } from "@/lib/records";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const KPI = [
  ["total", "Total records"],
  ["verified", "Verified"],
  ["discrepancies", "Discrepancies"],
  ["pendingReview", "Pending review"],
  ["missingEvidence", "Missing evidence"],
] as const;

const REPORTING_YEARS = [2024, 2025, 2026, 2027];
const PERIOD_STORAGE_KEY = "ghg-hub-period";
const periodSelect =
  "h-10 min-w-[9.5rem] rounded-md border border-slate-300 bg-white px-3 text-sm text-[#0c2340] outline-none focus:border-[#1d4e89] focus:ring-2 focus:ring-[#1d4e89]/20";

function readStoredPeriod(): { month: string; year: number } {
  const parsed = parsePeriodLabel(localStorage.getItem(PERIOD_STORAGE_KEY) ?? "");
  if (parsed && MONTHS.includes(parsed.month)) return parsed;
  return { month: "September", year: 2026 };
}

function publishPeriod(month: string, year: number) {
  localStorage.setItem(PERIOD_STORAGE_KEY, `${month} ${year}`);
  window.dispatchEvent(new Event("ghg-hub-period-changed"));
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [month, setMonth] = useState("September");
  const [year, setYear] = useState(2026);
  const [resetBusy, setResetBusy] = useState(false);

  const loadDashboard = useCallback(async (reportingMonth: string, reportingYear: number) => {
    const query = new URLSearchParams({ month: reportingMonth, year: String(reportingYear) });
    return api<DashboardData>(`/api/dashboard?${query}`);
  }, []);

  useEffect(() => {
    const stored = readStoredPeriod();
    setMonth(stored.month);
    setYear(stored.year);
    loadDashboard(stored.month, stored.year)
      .then((dashboard) => {
        setData(dashboard);
        const fromLatest = parsePeriodLabel(dashboard.latestPeriod);
        if (fromLatest && !localStorage.getItem(PERIOD_STORAGE_KEY)) {
          setMonth(fromLatest.month);
          setYear(fromLatest.year);
          publishPeriod(fromLatest.month, fromLatest.year);
        }
      })
      .catch((error: Error) => toast.error(error.message));
  }, [loadDashboard]);

  async function clearAyobaDemo() {
    if (
      !window.confirm(
        `Reset Ayoba for ${month} ${year}? This removes the verification run, data collection template, reported consumption, evidence files, results, and reviewer sign-off.`,
      )
    ) {
      return;
    }
    setResetBusy(true);
    try {
      await api("/api/demo/reset-ayoba-verification", {
        method: "POST",
        body: JSON.stringify({ reportingMonth: month, reportingYear: year }),
      });
      setData(await loadDashboard(month, year));
      toast.success("Ayoba demo reset complete. Start again from New Verification.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not clear Ayoba verification.");
    } finally {
      setResetBusy(false);
    }
  }

  async function changePeriod(nextMonth: string, nextYear: number) {
    setMonth(nextMonth);
    setYear(nextYear);
    publishPeriod(nextMonth, nextYear);
    try {
      setData(await loadDashboard(nextMonth, nextYear));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load dashboard for this period.");
    }
  }

  if (!data) return <p className="text-sm text-slate-500">Loading verification activity…</p>;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Monthly greenhouse gas activity verification for the selected operating company."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-500">
              Month
              <select
                className={`${periodSelect} mt-1 block`}
                value={month}
                onChange={(event) => changePeriod(event.target.value, year)}
              >
                {MONTHS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Year
              <select
                className={`${periodSelect} mt-1 block min-w-[5.5rem]`}
                value={year}
                onChange={(event) => changePeriod(month, Number(event.target.value))}
              >
                {REPORTING_YEARS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <Button type="button" variant="danger" className="mb-0.5" disabled={resetBusy} onClick={clearAyobaDemo}>
              {resetBusy ? "Clearing…" : "Clear Ayoba verification"}
            </Button>
          </div>
        }
      />
      {data.source === "demonstration" ? (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p className="font-semibold">Demonstration figures</p>
          <p className="mt-1">{data.note}</p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {KPI.map(([key, label]) => (
          <Card key={key}>
            <CardContent className="py-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold text-[#0c2340]">{data[key]}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardContent className="py-5">
          <div className="mb-2 flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-[#0c2340]">Verification progress</span>
            <span className="text-right text-slate-600">
              {data.opcosApproved} of {data.opcosTotal} OPCOs reviewer-approved ({data.progress}%)
            </span>
          </div>
          <Progress value={data.progress} />
          <p className="mt-2 text-xs text-slate-500">
            Each operating company counts once for this period when every verification line has been accepted by a reviewer.
          </p>
          {data.processingErrors > 0 ? <p className="mt-2 text-sm text-rose-700">{data.processingErrors} processing error{data.processingErrors === 1 ? "" : "s"} need technical review.</p> : null}
        </CardContent>
      </Card>
      <NeedsAttentionPanel data={data} month={month} year={year} />
      <Card className="mt-4">
        <CardHeader><CardTitle>Verification activity</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-max max-w-full border-collapse text-left text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
            <colgroup>
              <col />
              <col />
              <col />
              <col style={{ width: "4rem" }} />
              <col style={{ width: "9.5rem" }} />
              <col style={{ width: "9.5rem" }} />
            </colgroup>
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {["OPCO", "Reporting month", "Scope", "Records", "System check", "Reviewer"].map((heading, index) => (
                  <th
                    key={heading}
                    className={`py-2 font-medium ${index === 0 ? "pr-8 pl-0" : index === 5 ? "pl-8 pr-0" : "px-8"} ${heading === "Records" ? "text-right" : "text-left"}`}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.activity.length === 0 ? (
                <tr>
                  <td className="py-6 text-slate-500" colSpan={6}>
                    No verification activity for {month} {year}.
                  </td>
                </tr>
              ) : null}
              {data.activity.map((row) => (
                <tr key={`${row.opco}-${row.reportingMonth}-${row.scope}-${row.runId ?? "demo"}`} className="border-t border-slate-100">
                  <td className="py-3 pr-8 pl-0 font-medium text-[#0c2340]">{row.opco}</td>
                  <td className="px-8 py-3">{row.reportingMonth}</td>
                  <td className="px-8 py-3">{row.scope}</td>
                  <td className="px-8 py-3 text-right tabular-nums">{row.records}</td>
                  <td className="px-8 py-3">
                    {row.runId ? (
                      <Link href={`/verification/${row.runId}`}>
                        <StatusBadge value={row.status} />
                      </Link>
                    ) : (
                      <StatusBadge value={row.status} />
                    )}
                  </td>
                  <td className="py-3 pl-8 pr-0">
                    {row.reviewerDecision === "—" ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <StatusBadge value={row.reviewerDecision} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function NeedsAttentionPanel({
  data,
  month,
  year,
}: {
  data: DashboardData;
  month: string;
  year: number;
}) {
  const periodLabel = `${month} ${year}`;

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Needs attention</CardTitle>
          <p className="mt-1 text-sm text-slate-600">
            Open items for {periodLabel} that still need evidence, review, or reviewer sign-off.
          </p>
        </div>
        {data.primaryRunId ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/verification/${data.primaryRunId}`}>Open results</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/runs/${data.primaryRunId}/export/excel`}>Export sheet</a>
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {data.total === 0 && !data.primaryRunId ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              No verification run with results for {periodLabel}. Start a run to upload the template and evidence.
            </p>
            <Button size="sm" asChild>
              <Link href="/verification/new">Start verification</Link>
            </Button>
          </div>
        ) : null}
        {data.total > 0 && data.attentionItems.length === 0 ? (
          <p className="text-sm text-slate-700">
            All verification lines for {periodLabel} have reviewer approval. Use Export sheet to download the results workbook.
          </p>
        ) : null}
        {data.attentionItems.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {data.attentionItems.map((item) => (
              <li key={item.resultId} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-[#0c2340]">{item.facilityName}</p>
                  <p className="text-sm text-slate-600">
                    {item.opco} · {item.category}
                  </p>
                  <p className="text-sm text-slate-500">{item.reason}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <StatusBadge value={item.automatedStatus} />
                    <StatusBadge value={item.reviewerStatus ?? "Pending review"} />
                  </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" asChild>
                  <Link href={`/verification/${item.runId}`}>Review</Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
