"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { OPCOConfiguration } from "@engine/shared/types";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SettingsResponse {
  opcos: OPCOConfiguration[];
  methodologies: Array<{ name: string; version: string; approvalStatus: string } | undefined>;
}

export function OpcoView() {
  const router = useRouter();
  const [data, setData] = useState<SettingsResponse | null>(null);

  useEffect(() => {
    api<SettingsResponse>("/api/settings").then(setData).catch((error: Error) => toast.error(error.message));
  }, []);

  return (
    <div>
      <PageHeader
        title="OPCO selection"
        description="The selected operating company determines which verification methodology is applied. Additional companies are added by configuration, not by copying the application."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data?.opcos ?? []).map((opco, index) => {
          const methodology = data?.methodologies[index];
          return (
            <Card key={opco.id}>
              <CardContent className="space-y-3 py-5">
                <div className="flex items-start justify-between">
                  <h2 className="text-xl font-semibold text-[#0c2340]">{opco.name}</h2>
                  <StatusBadge value={opco.isActive ? "Active" : "Inactive"} />
                </div>
                <dl className="space-y-1 text-sm text-slate-600">
                  <div className="flex justify-between gap-4"><dt>Region</dt><dd>{opco.region || "Not configured"}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Methodology</dt><dd className="text-right">{methodology?.name ?? opco.methodologyId}</dd></div>
                </dl>
                <Button
                  onClick={() => {
                    localStorage.setItem("ghg-hub-opco", opco.name);
                    toast.success(`${opco.name} selected.`);
                    router.push("/verification/new");
                  }}
                >
                  Select OPCO
                </Button>
              </CardContent>
            </Card>
          );
        })}
        <Card className="border-dashed bg-transparent">
          <CardContent className="py-5">
            <h2 className="text-xl font-semibold text-slate-500">Additional OPCOs</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              About 20 operating companies can be introduced later. Add an OPCO configuration, an Excel mapping and a methodology. The verification screens stay the same.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
