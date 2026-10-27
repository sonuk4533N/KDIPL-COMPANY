import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  IndianRupee,
  Layers,
  PackageSearch,
  Search,
  ShieldAlert,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getAdvancedManagementDashboard } from "@/server/intelligence/dashboard-service";
import { requireCurrentPrincipal } from "@/server/auth/current-user";

const tone = {
  blue: "bg-blue-50 text-blue-700 border-blue-200 group-hover:border-blue-300",
  amber:
    "bg-amber-50 text-amber-700 border-amber-200 group-hover:border-amber-300",
  red: "bg-red-50 text-red-700 border-red-200 group-hover:border-red-300",
  green:
    "bg-emerald-50 text-emerald-700 border-emerald-200 group-hover:border-emerald-300",
} as const;

const urgencyBadge = {
  NORMAL: "bg-slate-100 text-slate-700 border-slate-200",
  HIGH: "bg-amber-100 text-amber-800 border-amber-300",
  CRITICAL: "bg-red-100 text-red-800 border-red-300 font-bold animate-pulse",
} as const;

export default async function DashboardPage() {
  const principal = await requireCurrentPrincipal();
  const dashboard = await getAdvancedManagementDashboard(principal);

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow={`Phase 12 BI Cockpit · ${dashboard.roleTitle}`}
        title={`Good day, ${principal.displayName.split(" ")[0]}.`}
        description="Real-time operational KPIs, pending approval matrices, and project-wise stock/financial positions. Click any metric or project to drill down."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/search"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Search className="size-3.5 text-slate-400" />
              Global Search
            </Link>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <FileSpreadsheet className="size-3.5 text-blue-600" />
              Reports & BI
            </Link>
            <Link
              href="/approvals"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Clock3 className="size-3.5" />
              Approvals Queue
            </Link>
          </div>
        }
      />

      {/* Real-time Alerts */}
      {dashboard.alerts.map((alert, idx) => {
        const alertBody = (
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-sm transition ${
              alert.severity === "CRITICAL"
                ? "border-red-300 bg-red-50 text-red-900 hover:border-red-400 hover:bg-red-100/60"
                : alert.severity === "WARNING"
                  ? "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:bg-amber-100/60"
                  : "border-blue-300 bg-blue-50 text-blue-900 hover:border-blue-400 hover:bg-blue-100/60"
            }`}
            role="status"
          >
            <div className="flex items-center gap-3">
              {alert.severity === "CRITICAL" ? (
                <ShieldAlert className="size-5 shrink-0 text-red-700" />
              ) : alert.severity === "WARNING" ? (
                <AlertCircle className="size-5 shrink-0 text-amber-700" />
              ) : (
                <CheckCircle2 className="size-5 shrink-0 text-blue-700" />
              )}
              <div>
                <strong>Operational Advisory:</strong> {alert.message}
              </div>
            </div>
            {alert.href && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold underline decoration-current/40 underline-offset-2 transition group-hover:decoration-current">
                {alert.actionText || "View details"}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </div>
        );

        return alert.href ? (
          <Link
            key={idx}
            href={alert.href}
            className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {alertBody}
          </Link>
        ) : (
          <div key={idx}>{alertBody}</div>
        );
      })}

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboard.cards.map((item, index) => {
          const Icon = [BarChart3, Clock3, PackageSearch, IndianRupee][
            index % 4
          ];
          const href = item.href || "/reports";

          return (
            <Link
              key={item.label}
              href={href}
              className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Card className="h-full overflow-hidden border border-slate-200 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-blue-400 hover:shadow-md cursor-pointer group-hover:bg-slate-50/40">
                <CardContent className="flex h-full flex-col justify-between p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <div
                        className={`grid size-10 place-items-center rounded-xl border transition-transform duration-200 group-hover:scale-105 ${tone[item.tone]}`}
                      >
                        <Icon className="size-5" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.change && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {item.change}
                          </span>
                        )}
                        <span className="grid size-7 place-items-center rounded-full bg-slate-100 text-slate-400 transition-all duration-150 group-hover:bg-blue-600 group-hover:text-white">
                          <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-500 transition-colors group-hover:text-slate-700">
                      {item.label}
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-950 transition-colors group-hover:text-blue-700">
                      {item.value}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span className="line-clamp-1">{item.detail}</span>
                    <span className="ml-2 shrink-0 font-semibold text-blue-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      Explore →
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Pending Approvals Queue & Quick Access */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Approvals Matrix */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Clock3 className="size-5 text-amber-600" />
              Pending Approvals Queue
            </h2>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                {dashboard.pendingApprovals.length} Actions Required
              </span>
              <Link
                href="/approvals"
                className="hidden items-center gap-1 text-xs font-semibold text-blue-700 transition hover:text-blue-900 hover:underline sm:inline-flex"
              >
                View all
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {dashboard.pendingApprovals.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                All approval queues are completely clear! Zero pending
                bottlenecks.
              </div>
            ) : (
              dashboard.pendingApprovals.map((appr) => (
                <Link
                  key={appr.id}
                  href={appr.approvalUrl}
                  className="group -mx-2 flex flex-col gap-2 rounded-xl border border-transparent p-3 transition hover:border-amber-200 hover:bg-amber-50/50 hover:shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-medium ${urgencyBadge[appr.urgency]}`}
                      >
                        {appr.urgency}
                      </span>
                      <span className="font-semibold text-slate-900 transition-colors group-hover:text-blue-700">
                        {appr.code}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Requested by:{" "}
                      <span className="font-medium text-slate-700">
                        {appr.requestedBy}
                      </span>{" "}
                      · {appr.amountOrQuantity} · {appr.submittedAt}
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-2xs transition group-hover:border-blue-600 group-hover:bg-blue-600 group-hover:text-white">
                    Review & Authorize
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Operational Modules Navigation */}
        <div className="space-y-3">
          {[
            [
              "Report Catalogue & BI",
              "Access financial, stock aging, and consumption trend analytics.",
              "/reports",
              FileSpreadsheet,
              "Explore 30+ Reports",
            ],
            [
              "Global Search & Tracing",
              "Trace end-to-end lineage from indent to PO, GRN, bill, and Tally export.",
              "/search",
              Layers,
              "Search Lineage",
            ],
            [
              "Pending Approvals Matrix",
              "Drill down into department-wise approval aging and SLA timers.",
              "/reports/pending-approvals",
              Clock3,
              "Inspect SLA Matrix",
            ],
          ].map(([title, description, href, NavIcon, badgeText]) => (
            <Link
              key={href as string}
              href={href as string}
              className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition duration-150 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                <NavIcon className="size-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-blue-700">
                    {title as string}
                  </h3>
                  <ArrowRight className="size-4 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-blue-600" />
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {description as string}
                </p>
                <span className="mt-2 inline-block text-[11px] font-semibold text-blue-600 group-hover:underline">
                  {badgeText as string} →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Project Financial & Physical Position Matrix */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Active Project Financial & Physical Positions
            </h2>
            <p className="text-xs text-slate-500">
              Budget consumption, committed purchase orders, site stock
              valuation, and physical progress monitoring. Click any project or
              figure to drill down.
            </p>
          </div>
          <Link
            href="/projects"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 transition hover:text-blue-900 hover:underline"
          >
            View Project Portfolio
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Project</th>
                <th className="py-2.5 px-3 font-semibold">Sanctioned Budget</th>
                <th className="py-2.5 px-3 font-semibold">Actual Spent</th>
                <th className="py-2.5 px-3 font-semibold">Committed Cost</th>
                <th className="py-2.5 px-3 font-semibold">Site Stock</th>
                <th className="py-2.5 px-3 font-semibold">Physical Progress</th>
                <th className="py-2.5 px-3 font-semibold">Financial Burn</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.projectPositions.map((p) => (
                <tr
                  key={p.projectId}
                  className="transition-colors hover:bg-blue-50/30"
                >
                  <td className="py-3 px-3">
                    <Link
                      href={`/projects/${p.projectId}`}
                      className="group/proj block focus-visible:outline-none"
                    >
                      <div className="flex items-center gap-1 font-semibold text-slate-900 transition-colors group-hover/proj:text-blue-700 group-hover/proj:underline">
                        {p.projectName}
                        <ArrowRight className="size-3 opacity-0 transition-opacity group-hover/proj:opacity-100" />
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {p.projectCode}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      href={`/reports/budget-analytics?projectId=${p.projectId}`}
                      className="transition-colors hover:text-blue-700 hover:underline"
                      title="View Budget Analytics"
                    >
                      ₹{p.budgetTotal.toLocaleString("en-IN")}
                    </Link>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-900">
                    <Link
                      href={`/reports/budget-analytics?projectId=${p.projectId}`}
                      className="transition-colors hover:text-blue-700 hover:underline"
                      title="View Incurred Expenses"
                    >
                      ₹{p.actualSpent.toLocaleString("en-IN")}
                    </Link>
                  </td>
                  <td className="py-3 px-3 text-slate-600">
                    <Link
                      href={`/reports/budget-analytics?projectId=${p.projectId}`}
                      className="transition-colors hover:text-blue-700 hover:underline"
                      title="View Committed Purchase Orders"
                    >
                      ₹{p.committedCost.toLocaleString("en-IN")}
                    </Link>
                  </td>
                  <td className="py-3 px-3 font-medium text-blue-700">
                    <Link
                      href={`/reports/current-stock-project?projectId=${p.projectId}`}
                      className="transition-colors hover:underline"
                      title="View Stock by Project and Site"
                    >
                      ₹{p.stockValuation.toLocaleString("en-IN")}
                    </Link>
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      href={`/projects/${p.projectId}`}
                      className="group/prog flex items-center gap-2 transition-colors hover:text-blue-700"
                      title="View Project Milestones"
                    >
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-colors group-hover/prog:bg-emerald-500"
                          style={{ width: `${p.physicalProgressPercent}%` }}
                        />
                      </div>
                      <span>{p.physicalProgressPercent}%</span>
                    </Link>
                  </td>
                  <td className="py-3 px-3">
                    <Link
                      href={`/reports/budget-analytics?projectId=${p.projectId}`}
                      className="group/burn flex items-center gap-2 transition-colors hover:text-blue-700"
                      title="View Financial Burn Analysis"
                    >
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            p.financialProgressPercent > 90
                              ? "bg-red-500"
                              : p.financialProgressPercent > 75
                                ? "bg-amber-500"
                                : "bg-blue-600"
                          }`}
                          style={{
                            width: `${Math.min(100, p.financialProgressPercent)}%`,
                          }}
                        />
                      </div>
                      <span>{p.financialProgressPercent}%</span>
                    </Link>
                  </td>
                  <td className="py-3 px-3">
                    <Link href={`/projects/${p.projectId}`}>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold transition hover:scale-105 ${
                          p.status === "ON_TRACK"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : p.status === "WARNING"
                              ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                              : "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        }`}
                      >
                        {p.status.replaceAll("_", " ")}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <Link
                      href={`/projects/${p.projectId}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-2xs transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      View
                      <ArrowRight className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-2 text-xs text-slate-500 sm:flex-row sm:items-center">
        <p>
          Phase 12 Real-Time Data Pipeline · Refreshed at{" "}
          {new Intl.DateTimeFormat("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Kolkata",
          }).format(new Date(dashboard.freshnessTimestamp))}
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="font-medium text-blue-700 hover:underline"
          >
            All System Reports
          </Link>
          <span>·</span>
          <Link
            href="/search"
            className="font-medium text-blue-700 hover:underline"
          >
            Audit Trail & Lineage
          </Link>
        </div>
      </div>
    </main>
  );
}
