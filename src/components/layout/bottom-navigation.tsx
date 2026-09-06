"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  canAccessNavigationItem,
  primaryNavigation,
  storeMobileNavigation,
  supervisorMobileNavigation,
} from "@/components/layout/navigation";
import { cn } from "@/lib/cn";
import type { AuthenticatedPrincipal } from "@/types/application";

export function BottomNavigation({
  principal,
}: {
  principal: AuthenticatedPrincipal;
}) {
  const pathname = usePathname();
  const candidates = principal.roleCodes.includes("SITE_SUPERVISOR")
    ? supervisorMobileNavigation
    : principal.roleCodes.includes("STORE_KEEPER")
      ? storeMobileNavigation
      : primaryNavigation;
  const items = candidates
    .filter((item) => canAccessNavigationItem(item, principal.permissions))
    .slice(0, 5);
  return (
    <nav
      aria-label="Mobile navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 grid min-h-16 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] md:hidden",
        items.length === 5
          ? "grid-cols-5"
          : items.length === 4
            ? "grid-cols-4"
            : items.length === 3
              ? "grid-cols-3"
              : "grid-cols-2",
      )}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={`${item.label}-${item.href}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-500",
              active && "text-blue-700",
            )}
          >
            <Icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
