import {
  AlertTriangle,
  Ban,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  SearchX,
} from "lucide-react";

import { cn } from "@/lib/cn";

type StateKind =
  "empty" | "error" | "unauthorized" | "forbidden" | "not-found" | "loading";

const icons = {
  empty: Inbox,
  error: AlertTriangle,
  unauthorized: LockKeyhole,
  forbidden: Ban,
  "not-found": SearchX,
  loading: LoaderCircle,
};

export function ApplicationState({
  kind,
  title,
  description,
  action,
  className,
}: {
  kind: StateKind;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = icons[kind];
  return (
    <div
      className={cn(
        "flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center",
        className,
      )}
    >
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-600">
        <Icon
          aria-hidden="true"
          className={cn("size-6", kind === "loading" && "animate-spin")}
        />
      </div>
      <h2 className="font-display text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-slate-200", className)}
    />
  );
}
