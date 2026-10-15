import { Suspense } from "react";
import { ResultsRoute } from "@/components/verification/results-view";

export default function VerificationResultsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading verification results…</p>}>
      <ResultsRoute />
    </Suspense>
  );
}
