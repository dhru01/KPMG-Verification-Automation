"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import type { SessionUser } from "@/lib/types";
import type { ToleranceConfig } from "@engine/shared/types";
import { DEFAULT_TOLERANCE } from "@engine/shared/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingsPayload {
  settings: { tolerance: ToleranceConfig; opcoRegions: Record<string, string> };
  methodologies: Array<{ name: string; version: string; approvalStatus: string; description: string; rules: Array<{ name: string; enabled: boolean; isPilot: boolean; description: string }> } | undefined>;
  persistence: string;
}

export function SettingsView() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [system, setSystem] = useState<{
    processor: { available: boolean; detail: string };
    supabaseConfigured: boolean;
    workspace?: { status: string; mode: string; detail?: string };
    deployment?: { host: string; commit: string | null };
  } | null>(null);
  const [mode, setMode] = useState<ToleranceConfig["mode"]>("exact");
  const [limit, setLimit] = useState("0");
  const [region, setRegion] = useState("Not configured");

  useEffect(() => {
    api<{ user: SessionUser }>("/api/auth/me").then((result) => setUser(result.user)).catch(() => undefined);
    api<SettingsPayload>("/api/settings").then((result) => {
      setData(result);
      setMode(result.settings.tolerance.mode);
      setLimit(String(result.settings.tolerance.absoluteTolerance ?? result.settings.tolerance.percentageTolerance ?? 0));
      setRegion(result.settings.opcoRegions.ayoba ?? "Not configured");
    }).catch((error: Error) => toast.error(error.message));
    api<{
      processor: { available: boolean; detail: string };
      supabaseConfigured: boolean;
      workspace?: { status: string; mode: string; detail?: string };
      deployment?: { host: string; commit: string | null };
    }>("/api/system")
      .then(setSystem)
      .catch(() => undefined);
  }, []);


  async function save() {
    const tolerance: ToleranceConfig = mode === "exact"
      ? DEFAULT_TOLERANCE
      : mode === "absolute"
        ? { mode, absoluteTolerance: Number(limit), approvalStatus: "configured_unapproved", label: "Configured absolute tolerance" }
        : { mode, percentageTolerance: Number(limit), approvalStatus: "configured_unapproved", label: "Configured percentage tolerance" };
    try {
      await api("/api/settings", { method: "PATCH", body: JSON.stringify({ tolerance, region }) });
      toast.success("Settings saved. Tolerances other than exact match are not an approved KPMG tolerance.");
      const refreshed = await api<SettingsPayload>("/api/settings");
      setData(refreshed);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Settings could not be saved.");
    }
  }

  const admin = user?.role === "administrator";
  const methodology = data?.methodologies[0];

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Roles, verification methodology, tolerance and the local processing services." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Workspace access</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>{user?.name}</p>
            <p className="capitalize">{user?.role}</p>
            <p>Administrators manage OPCOs, methodologies and tolerance. Consultants upload data and run verification. Reviewers accept, flag or request more evidence.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tolerance</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-slate-600">Current: {data?.settings.tolerance.label}</p>
            <label className="block">Mode
              <select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" disabled={!admin} value={mode} onChange={(event) => setMode(event.target.value as ToleranceConfig["mode"])}>
                <option value="exact">Exact match</option>
                <option value="absolute">Absolute tolerance</option>
                <option value="percentage">Percentage tolerance</option>
              </select>
            </label>
            {mode !== "exact" ? (
              <label className="block">{mode === "absolute" ? "Absolute difference allowed" : "Percentage allowed"}
                <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" disabled={!admin} value={limit} onChange={(event) => setLimit(event.target.value)} />
              </label>
            ) : null}
            <label className="block">Ayoba region
              <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" disabled={!admin} value={region} onChange={(event) => setRegion(event.target.value)} />
            </label>
            {admin ? <Button onClick={save}>Save settings</Button> : <p className="text-xs text-slate-500">Only an administrator can change tolerance or region.</p>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{methodology?.name ?? "Methodology"}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-slate-600">{methodology?.description} Version {methodology?.version}. Approval status: {methodology?.approvalStatus}.</p>
          <ul className="space-y-2">
            {methodology?.rules.map((rule) => (
              <li key={rule.name} className="rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-medium">{rule.name}</span>
                <span className="ml-2 text-xs uppercase tracking-wide text-slate-500">{rule.enabled ? "Enabled" : "Available, not enabled"}{rule.isPilot ? " · Pilot" : ""}</span>
                <p className="text-slate-600">{rule.description}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Processing and storage</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>{system?.processor.detail}</p>
          <p>{data?.persistence}</p>
          <p>{system?.supabaseConfigured ? "Supabase environment variables are set." : "Supabase environment variables are not set."}</p>
          <p>
            Workspace:{" "}
            {system?.workspace?.status === "ok"
              ? `connected (${system.workspace.mode})`
              : system?.workspace?.detail ?? "not checked"}
          </p>
          {system?.deployment?.commit ? (
            <p className="text-xs text-slate-500">Deployment commit: {system.deployment.commit.slice(0, 7)}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
