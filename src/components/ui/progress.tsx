"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";

export function Progress({ value }: { value: number }) {
  return (
    <ProgressPrimitive.Root className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
      <ProgressPrimitive.Indicator
        className="h-full rounded-full bg-[#1d4e89] transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
