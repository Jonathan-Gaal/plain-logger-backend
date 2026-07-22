"use client";

import { cn } from "@/lib/utils";

type Severity = "low" | "medium" | "high" | "critical";

const SEVERITY_STYLES: Record<Severity, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  critical: "bg-red-100 text-red-800 border-red-300",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
        SEVERITY_STYLES[severity]
      )}
    >
      {severity}
    </span>
  );
}
