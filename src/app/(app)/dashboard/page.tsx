import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  IndianRupee,
  PackageSearch,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { dashboardData } from "@/features/reporting/reporting-queries";
import { requireCurrentPrincipal } from "@/server/auth/current-user";

const tone = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  green: "bg-emerald-50 text-emerald-700",
} as const;

export default async function DashboardPage() {
  const principal = await requireCurrentPrincipal();
  const dashboard = await dashboardData(principal);
  const role = principal.roleCodes[0]?.replaceAll("_", " ") ?? "TEAM MEMBER";
  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow={`Phase 8 · ${role}`}
        title={`Good day, ${principal.displayName.split(" ")[0]}.`}
        description={`${dashboard.scopeLabel}. Operational, inventory and financial indicators are calculated from authorized source transactions.`}
      />
      {dashboard.valuationWarning && (
        <div
          className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <strong>Quantity-only stock reporting.</strong> Stock monetary
            valuation is awaiting CA-approved policy.
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboard.cards.map((item, index) => {
          const Icon = [BarChart3, Clock3, PackageSearch, IndianRupee][
            index % 4
          ];
          return (
            <Card key={item.label}>
              <CardContent>
                <div
                  className={`mb-4 grid size-10 place-items-center rounded-xl ${tone[item.tone as keyof typeof tone]}`}
                >
                  <Icon className="size-5" />
                </div>
                <p className="text-sm font-medium text-slate-500">
                  {item.label}
                </p>
                <p className="mt-1 font-display text-2xl font-bold text-slate-950">
                  {item.value}
                </p>
                <p className="mt-2 text-xs text-slate-500">{item.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          [
            "Report catalogue",
            "Filter, save, export and print authorized operational reports.",
            "/reports",
          ],
          [
            "Global search",
            "Find permitted transactions, people, suppliers, projects and materials.",
            "/search",
          ],
          [
            "Pending approvals",
            "Review approval queues by type and age.",
            "/reports/pending-approvals",
          ],
        ].map(([title, description, href]) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border bg-white p-5 hover:border-blue-300"
          >
            <h2 className="font-display font-bold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {description}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
              Open{" "}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Financial year {dashboard.financialYear} · Data refreshed{" "}
        {new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }).format(new Date(dashboard.freshness))}{" "}
        · Valuation: {dashboard.valuationMethod.replaceAll("_", " ")}
      </p>
    </main>
  );
}
