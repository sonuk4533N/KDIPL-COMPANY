import { AlertCircle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/cn";

const alertConfig = {
  info: { icon: Info, styles: "border-blue-200 bg-blue-50 text-blue-900" },
  success: {
    icon: CheckCircle2,
    styles: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  error: { icon: AlertCircle, styles: "border-red-200 bg-red-50 text-red-900" },
};

export function Alert({
  variant = "info",
  children,
}: {
  variant?: keyof typeof alertConfig;
  children: React.ReactNode;
}) {
  const config = alertConfig[variant];
  const Icon = config.icon;
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-3 text-sm", config.styles)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
