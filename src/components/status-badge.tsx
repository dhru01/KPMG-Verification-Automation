import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  Verified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Processed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Attached: "bg-slate-100 text-slate-700 ring-slate-200",
  Discrepancy: "bg-amber-50 text-amber-900 ring-amber-200",
  "Missing Evidence": "bg-orange-50 text-orange-900 ring-orange-200",
  "Manual Review": "bg-sky-50 text-sky-900 ring-sky-200",
  Accepted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "Pending review": "bg-sky-50 text-sky-900 ring-sky-200",
  "Flagged for Follow-up": "bg-amber-50 text-amber-900 ring-amber-200",
  "Additional Evidence Requested": "bg-orange-50 text-orange-900 ring-orange-200",
  "Reviewer decision pending": "bg-slate-100 text-slate-600 ring-slate-200",
  "Pending Review": "bg-sky-50 text-sky-900 ring-sky-200",
  "Needs Review": "bg-sky-50 text-sky-900 ring-sky-200",
  "In Progress": "bg-blue-50 text-blue-800 ring-blue-200",
  Draft: "bg-slate-100 text-slate-700 ring-slate-200",
  "Not started": "bg-slate-100 text-slate-600 ring-slate-200",
  "Processing Error": "bg-rose-50 text-rose-800 ring-rose-200",
  Failed: "bg-rose-50 text-rose-800 ring-rose-200",
  Valid: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "Needs mapping review": "bg-amber-50 text-amber-900 ring-amber-200",
  Invalid: "bg-rose-50 text-rose-800 ring-rose-200",
};

const COMPACT_LABELS: Record<string, string> = {
  "Flagged for Follow-up": "Flagged",
  "Additional Evidence Requested": "Evidence requested",
  "Reviewer decision pending": "Pending",
  "Pending review": "Pending",
};

export function StatusBadge({ value, compact = false }: { value: string; compact?: boolean }) {
  const label = compact && COMPACT_LABELS[value] ? COMPACT_LABELS[value] : value;
  return (
    <span
      title={compact && label !== value ? value : undefined}
      className={cn(
        "inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none ring-1 ring-inset",
        STYLES[value] ?? "bg-slate-100 text-slate-700 ring-slate-200",
      )}
    >
      {label}
    </span>
  );
}
