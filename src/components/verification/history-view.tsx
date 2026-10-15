"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parsePeriodLabel } from "@/lib/dashboard";
import { MONTHS } from "@/lib/records";
import type { VerificationLiveData } from "@/lib/verification-live";
import { formatTimestamp } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const REPORTING_YEARS = [2024, 2025, 2026, 2027];
const PERIOD_STORAGE_KEY = "ghg-hub-period";
const periodSelect =
  "h-10 min-w-[9.5rem] rounded-md border border-slate-300 bg-white px-3 text-sm text-[#0c2340] outline-none focus:border-[#1d4e89] focus:ring-2 focus:ring-[#1d4e89]/20";

function readStoredPeriod(): { month: string; year: number } {
  const parsed = parsePeriodLabel(localStorage.getItem(PERIOD_STORAGE_KEY) ?? "");
  if (parsed && MONTHS.includes(parsed.month)) return parsed;
  return { month: "September", year: 2026 };
}

export function HistoryView() {
  const [live, setLive] = useState<VerificationLiveData | null>(null);
  const [month, setMonth] = useState("September");
  const [year, setYear] = useState(2026);
  const [query, setQuery] = useState("");

  const loadLive = useCallback(async (reportingMonth: string, reportingYear: number) => {
    const params = new URLSearchParams({ month: reportingMonth, year: String(reportingYear) });
    return api<VerificationLiveData>(`/api/verification/live?${params}`);
  }, []);

  useEffect(() => {
    const stored = readStoredPeriod();
    setMonth(stored.month);
    setYear(stored.year);
    loadLive(stored.month, stored.year)
      .then(setLive)
      .catch((error: Error) => toast.error(error.message));
  }, [loadLive]);

  async function changePeriod(nextMonth: string, nextYear: number) {
    setMonth(nextMonth);
    setYear(nextYear);
    localStorage.setItem(PERIOD_STORAGE_KEY, `${nextMonth} ${nextYear}`);
    window.dispatchEvent(new Event("ghg-hub-period-changed"));
    try {
      setLive(await loadLive(nextMonth, nextYear));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load live verification status.");
    }
  }

  const visible = (live?.rows ?? []).filter((row) => {
    const haystack = `${row.opcoName} ${row.verificationStatus} ${row.reviewerDecision} ${row.resultsSummary}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <div>
      <PageHeader
        title="Live verification"
        description="Current status for each operating company in the selected reporting period. Re-runs update the live row; older attempts are not listed here."
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
          </div>
        }
      />
      {live ? (
        <Card className="mb-4">
          <CardContent className="py-5">
            <div className="mb-2 flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-[#0c2340]">Portfolio reviewer sign-off</span>
              <span className="text-slate-600">
                {live.opcosApproved} of {live.opcosTotal} OPCOs approved ({live.progress}%)
              </span>
            </div>
            <Progress value={live.progress} />
          </CardContent>
        </Card>
      ) : null}
      <input
        className="mb-4 h-10 w-full max-w-md rounded-md border border-slate-300 px-3 text-sm"
        placeholder="Search OPCO or status"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Card>
        <CardContent className="overflow-x-auto py-2">
          {!live ? <p className="py-8 text-sm text-slate-500">Loading live verification status…</p> : null}
          {live && visible.length === 0 ? (
            <p className="py-8 text-sm text-slate-500">No operating companies match this search.</p>
          ) : null}
          {live && visible.length > 0 ? (
            <table className="w-full table-fixed border-collapse text-center text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "9%" }} />
              </colgroup>
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {["OPCO", "Records", "Results", "System check", "Reviewer", "Last updated", ""].map((heading) => (
                    <th key={heading || "action"} className="px-3 py-3 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.opcoId} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-medium text-[#0c2340]">
                      {row.opcoName}
                      {row.isDemonstration ? <span className="block text-xs font-normal text-slate-500">demo</span> : null}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{row.records}</td>
                    <td className="px-3 py-3 text-slate-700">{row.resultsSummary}</td>
                    <td className="px-3 py-3">
                      <StatusBadge value={row.verificationStatus} />
                    </td>
                    <td className="px-3 py-3">
                      {row.reviewerDecision === "—" ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <StatusBadge value={row.reviewerDecision} />
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {row.lastUpdated ? formatTimestamp(row.lastUpdated) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {row.runId ? (
                        <Link
                          className="font-medium text-[#1d4e89]"
                          href={row.hasVerificationResults ? `/verification/${row.runId}` : `/verification/new?run=${row.runId}`}
                        >
                          Open
                        </Link>
                      ) : (
                        <Button variant="outline" size="sm" className="mx-auto" asChild>
                          <Link href="/verification/new">Start</Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
