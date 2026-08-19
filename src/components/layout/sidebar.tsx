"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  administrationNavigation,
  primaryNavigation,
} from "@/components/layout/navigation";
import { cn } from "@/lib/cn";

export function Sidebar({ canAdminister }: { canAdminister: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-slate-950 text-slate-300 md:flex">
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
        <div className="grid size-10 place-items-center rounded-xl bg-blue-600 font-display text-lg font-extrabold text-white">
          K
        </div>
        <div>
          <div className="font-display font-extrabold tracking-tight text-white">
            KDIPL
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
            Operations platform
          </div>
        </div>
      </div>
      <nav
        aria-label="Primary navigation"
        className="flex-1 space-y-1 px-3 py-5"
      >
        {primaryNavigation.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-white/7 hover:text-white",
                active && "bg-blue-600 text-white",
              )}
            >
              <Icon aria-hidden="true" className="size-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {canAdminister ? (
        <div className="border-t border-white/10 p-3">
          <Link
            href={administrationNavigation.href}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-white/7 hover:text-white",
              pathname.startsWith(administrationNavigation.href) &&
                "bg-blue-600 text-white",
            )}
          >
            <administrationNavigation.icon className="size-[18px]" />
            {administrationNavigation.label}
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
