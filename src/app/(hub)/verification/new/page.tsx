import type { Metadata } from "next";
import { Suspense } from "react";
import { Wizard } from "@/components/verification/wizard";

export const metadata: Metadata = { title: "New verification" };

export default function NewVerificationPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading verification workflow…</p>}>
      <Wizard />
    </Suspense>
  );
}
