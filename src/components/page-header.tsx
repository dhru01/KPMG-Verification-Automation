import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  descriptionClassName,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  descriptionClassName?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0c2340]">{title}</h1>
        <p className={cn("mt-1 max-w-3xl text-pretty text-sm leading-6 text-slate-600", descriptionClassName)}>
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
