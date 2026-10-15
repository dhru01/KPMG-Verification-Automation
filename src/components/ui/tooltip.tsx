"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={6}
        className={`z-50 max-w-xs rounded-md bg-[#0c2340] px-3 py-2 text-xs leading-5 text-white shadow-lg ${className ?? ""}`}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
