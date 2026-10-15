"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { parsePeriodLabel } from "@/lib/dashboard";
import { MONTHS } from "@/lib/records";
import type { VerificationAuditSummaryData } from "@/lib/verification-audit-summary";
import { formatTimestamp } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REPORTING_YEARS = [2024, 2025, 2026, 2027];
const PERIOD_STORAGE_KEY = "ghg-hub-period";
const periodSelect =
  "h-10 min-w-[9.5rem] rounded-md border border-slate-300 bg-white px-3 text-sm text-[#0c2340] outline-none focus:border-[#1d4e89] focus:ring-2 focus:ring-[#1d4e89]/20";

function readStoredPeriod(): { month: string; year: number } {
  const parsed = parsePeriodLabel(localStorage.getItem(PERIOD_STORAGE_KEY) ?? "");
  if (parsed && MONTHS.includes(parsed.month)) return parsed;
  return { month: "September", year: 2026 };
}

export function AuditLogView() {
  const [data, setData] = useState<VerificationAuditSummaryData | null>(null);
  const [month, setMonth] = useState("September");
  const [year, setYear] = useState(2026);
  const [query, setQuery] = useState("");

  const load = useCallback(async (reportingMonth: string, reportingYear: number) => {
    const params = new URLSearchParams({ month: reportingMonth, year: String(reportingYear) });
    return api<VerificationAuditSummaryData>(`/api/audit/summary?${params}`);
  }, []);

  useEffect(() => {
    const stored = readStoredPeriod();
    setMonth(stored.month);
    setYear(stored.year);
    load(stored.month, stored.year)
      .then(setData)
      .catch((error: Error) => toast.error(error.message));
  }, [load]);

  async function changePeriod(nextMonth: string, nextYear: number) {
    setMonth(nextMonth);
    setYear(nextYear);
    localStorage.setItem(PERIOD_STORAGE_KEY, `${nextMonth} ${nextYear}`);
    window.dispatchEvent(new Event("ghg-hub-period-changed"));
    try {
      setData(await load(nextMonth, nextYear));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load audit log.");
    }
  }

  const visible = (data?.rows ?? []).filter((row) => {
    const haystack = `${row.opcoName} ${row.verifiedBy} ${row.reviewedBy} ${row.outcomeSummary}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Traceability for each operating company: who ran verification, what the engine found, who signed off as reviewer, and when."
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

      {data ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-slate-500">Verifications this period</p>
              <p className="mt-2 text-3xl font-semibold text-[#0c2340]">{data.totalRuns}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-slate-500">Reviewer sign-off complete</p>
              <p className="mt-2 text-3xl font-semibold text-[#0c2340]">{data.fullySignedOff}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-slate-500">Reporting period</p>
              <p className="mt-2 text-lg font-semibold text-[#0c2340]">{month} {year}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <input
        className="mb-4 h-10 w-full max-w-md rounded-md border border-slate-300 px-3 text-sm"
        placeholder="Search OPCO, person, or outcome"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Verification traceability</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto pb-4">
          {!data ? <p className="py-8 text-center text-sm text-slate-500">Loading audit log…</p> : null}
          {data && visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No verified submissions for {month} {year}. Run verification to create an audit record.
            </p>
          ) : null}
          {data && visible.length > 0 ? (
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {[
                    "OPCO",
                    "Verified by",
                    "System check outcome",
                    "Reviewed by",
                    "Sign-off",
                    "Run status",
                    "",
                  ].map((heading) => (
                    <th key={heading || "action"} className="px-3 py-3 text-left font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.runId} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-4">
                      <p className="font-medium text-[#0c2340]">{row.opcoName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{row.reportingPeriod}</p>
                    </td>
                    <td className="px-3 py-4">
                      <p className="font-medium text-slate-800">{row.verifiedBy}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.verifiedAt ? formatTimestamp(row.verifiedAt) : "—"}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <p className="text-slate-700">{row.outcomeSummary}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.linesVerified} verification line(s)</p>
                    </td>
                    <td className="px-3 py-4">
                      <p className="font-medium text-slate-800">{row.reviewedBy}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.reviewedAt ? formatTimestamp(row.reviewedAt) : "Awaiting reviewer"}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge value={row.reviewerSignOff} />
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge value={row.verificationStatus} />
                    </td>
                    <td className="px-3 py-4">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/verification/${row.runId}`}>Open results</Link>
                      </Button>
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
