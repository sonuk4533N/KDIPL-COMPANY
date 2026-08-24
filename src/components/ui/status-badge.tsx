import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Info,
  Send,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/cn";

const statusConfig = {
  Draft: { icon: CircleDashed, styles: "bg-slate-100 text-slate-700" },
  Submitted: { icon: Send, styles: "bg-blue-50 text-blue-700" },
  Pending: { icon: Clock3, styles: "bg-amber-50 text-amber-800" },
  Approved: { icon: CheckCircle2, styles: "bg-emerald-50 text-emerald-800" },
  Rejected: { icon: XCircle, styles: "bg-red-50 text-red-800" },
  Partial: { icon: Info, styles: "bg-sky-50 text-sky-800" },
  Completed: { icon: CheckCircle2, styles: "bg-emerald-50 text-emerald-800" },
  Cancelled: { icon: Ban, styles: "bg-slate-100 text-slate-600" },
  Active: { icon: CheckCircle2, styles: "bg-emerald-50 text-emerald-800" },
  Planning: { icon: CircleDashed, styles: "bg-blue-50 text-blue-700" },
  "On hold": { icon: Clock3, styles: "bg-amber-50 text-amber-800" },
  Disabled: { icon: Ban, styles: "bg-slate-100 text-slate-600" },
} as const;

export type StandardStatus = keyof typeof statusConfig;

export function StatusBadge({
  status,
  className,
}: {
  status: StandardStatus;
  className?: string;
}) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold",
        config.styles,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {status}
    </span>
  );
}
