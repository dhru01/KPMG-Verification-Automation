"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ClientRun } from "@/lib/client-run";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ReportsView() {
  const [runs, setRuns] = useState<ClientRun[]>([]);
  const [runId, setRunId] = useState("");

  useEffect(() => {
    api<{ runs: ClientRun[] }>("/api/runs")
      .then((data) => {
        const ready = data.runs.filter((run) => run.results.length > 0);
        setRuns(ready);
        setRunId(ready[0]?.id ?? "");
      })
      .catch((error: Error) => toast.error(error.message));
  }, []);

  const run = runs.find((item) => item.id === runId);
  const count = (status: string) => run?.results.filter((result) => result.automatedStatus === status).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Export a working paper for the selected verification run. The file separates automated checks from reviewer decisions."
      />
      <Card className="mt-4">
        <CardHeader><CardTitle>Export</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {runs.length === 0 ? <p className="text-sm text-slate-500">Complete a verification run before exporting.</p> : null}
          {runs.length > 0 ? (
            <label className="block max-w-md text-sm font-medium text-slate-700">Verification run
              <select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" value={runId} onChange={(event) => setRunId(event.target.value)}>
                {runs.map((item) => <option key={item.id} value={item.id}>Ayoba · {item.reportingMonth} {item.reportingYear} · {item.methodologyVersion}</option>)}
              </select>
            </label>
          ) : null}
          {run ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-500">Total records</dt><dd className="text-lg font-semibold">{run.results.length}</dd></div>
              <div><dt className="text-slate-500">Verified</dt><dd className="text-lg font-semibold">{count("Verified")}</dd></div>
              <div><dt className="text-slate-500">Discrepancies</dt><dd className="text-lg font-semibold">{count("Discrepancy")}</dd></div>
              <div><dt className="text-slate-500">Missing evidence</dt><dd className="text-lg font-semibold">{count("Missing Evidence")}</dd></div>
              <div><dt className="text-slate-500">Manual review</dt><dd className="text-lg font-semibold">{count("Manual Review")}</dd></div>
              <div><dt className="text-slate-500">Reviewer</dt><dd className="text-lg font-semibold">{run.reviewerName ?? "Pending"}</dd></div>
            </dl>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!run} asChild><a href={run ? `/api/runs/${run.id}/export/excel` : "#"}>Excel workbook</a></Button>
            <Button variant="outline" disabled={!run} asChild><a href={run ? `/api/runs/${run.id}/export/pdf` : "#"}>PDF summary</a></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
