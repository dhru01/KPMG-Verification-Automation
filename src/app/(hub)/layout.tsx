"use client";

import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f6f8]" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
