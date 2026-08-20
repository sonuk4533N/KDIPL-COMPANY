"use client";

import {
  Bell,
  ChevronDown,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Input } from "@/components/ui/form-controls";
import { logoutAction } from "@/features/auth/actions";
import type { AuthenticatedPrincipal } from "@/types/application";

const labels: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  procurement: "Procurement",
  inventory: "Inventory",
  accounts: "Accounts",
  approvals: "Approvals",
  reports: "Reports",
  notifications: "Notifications",
  administration: "Administration",
};

export function Header({ principal }: { principal: AuthenticatedPrincipal }) {
  const pathname = usePathname();
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const pageLabel = labels[segment] ?? "KDIPL";
  const initials = principal.displayName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const role = principal.roleCodes[0]?.replaceAll("_", " ") ?? "User";
  return (
    <header className="sticky top-0 z-30 flex h-[76px] items-center gap-4 border-b border-slate-200 bg-white px-4 md:px-6 lg:px-8">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">
          KDIPL / <span className="text-slate-700">{pageLabel}</span>
        </p>
        <h1 className="truncate font-display text-lg font-bold text-slate-900">
          {pageLabel}
        </h1>
      </div>
      <div className="hidden w-full max-w-md lg:block">
        <label className="relative block">
          <span className="sr-only">Global search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            disabled
            className="pl-9"
            placeholder="Search projects, suppliers, invoices, materials..."
          />
        </label>
      </div>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button className="hidden sm:inline-flex" size="sm">
            <Plus className="size-4" />
            Create
            <ChevronDown className="size-4" />
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem disabled>Material Requirement</DropdownItem>
          <DropdownItem disabled>Purchase</DropdownItem>
          <DropdownItem disabled>Goods Receipt</DropdownItem>
          <DropdownSeparator />
          <p className="px-3 py-2 text-xs text-slate-500">
            Actions arrive in later phases.
          </p>
        </DropdownContent>
      </Dropdown>
      <button
        aria-label="Notifications"
        className="relative grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <Bell className="size-5" />
        <span className="absolute right-2 top-2 size-2 rounded-full bg-red-500">
          <span className="sr-only">Unread notifications</span>
        </span>
      </button>
      <Dropdown>
        <DropdownTrigger className="flex items-center gap-2 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          <span className="grid size-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
            {initials}
          </span>
          <span className="hidden xl:block">
            <span className="block text-sm font-semibold text-slate-900">
              {principal.displayName}
            </span>
            <span className="block text-[11px] capitalize text-slate-500">
              {role.toLowerCase()}
            </span>
          </span>
          <ChevronDown className="hidden size-4 text-slate-400 xl:block" />
        </DropdownTrigger>
        <DropdownContent>
          <div className="px-3 py-2">
            <p className="font-semibold text-slate-900">
              {principal.displayName}
            </p>
            <p className="text-xs text-slate-500">{principal.email}</p>
          </div>
          <DropdownSeparator />
          <Link
            href="/account/security"
            role="menuitem"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-700 outline-none hover:bg-slate-100 focus-visible:bg-slate-100"
          >
            <ShieldCheck className="size-4" />
            Security & sessions
          </Link>
          <DropdownSeparator />
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 outline-none hover:bg-slate-100 focus-visible:bg-slate-100"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </DropdownContent>
      </Dropdown>
    </header>
  );
}
