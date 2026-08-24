import Link from "next/link";

import { cn } from "@/lib/cn";

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "tertiary";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
        variant === "primary" && "bg-blue-700 text-white hover:bg-blue-800",
        variant === "secondary" &&
          "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
        variant === "tertiary" && "text-slate-700 hover:bg-slate-100",
        className,
      )}
    >
      {children}
    </Link>
  );
}
