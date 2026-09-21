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
  ShieldAlert,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getAdvancedManagementDashboard } from "@/server/intelligence/dashboard-service";
import { requireCurrentPrincipal } from "@/server/auth/current-user";

const tone = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
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
        description={`Real-time operational KPIs, pending approval matrices, and project-wise stock/financial positions.`}
      />

      {/* Real-time Alerts */}
      {dashboard.alerts.map((alert, idx) => (
        <div
          key={idx}
          className={`flex gap-3 rounded-xl border p-4 text-sm ${
            alert.severity === "CRITICAL"
              ? "border-red-300 bg-red-50 text-red-900"
              : alert.severity === "WARNING"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-blue-300 bg-blue-50 text-blue-900"
          }`}
          role="status"
        >
          {alert.severity === "CRITICAL" ? (
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-700" />
          ) : alert.severity === "WARNING" ? (
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-700" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-blue-700" />
          )}
          <div>
            <strong>Operational Advisory:</strong> {alert.message}
          </div>
        </div>
      ))}

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboard.cards.map((item, index) => {
          const Icon = [BarChart3, Clock3, PackageSearch, IndianRupee][
            index % 4
          ];
          return (
            <Card
              key={item.label}
              className="overflow-hidden border shadow-sm transition hover:shadow-md"
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div
                    className={`grid size-10 place-items-center rounded-xl border ${tone[item.tone]}`}
                  >
                    <Icon className="size-5" />
                  </div>
                  {item.change && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {item.change}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm font-medium text-slate-500">
                  {item.label}
                </p>
                <p className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-950">
                  {item.value}
                </p>
                <p className="mt-2 text-xs text-slate-500">{item.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pending Approvals Queue & Quick Access */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Approvals Matrix */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Clock3 className="size-5 text-amber-600" />
              Pending Approvals Queue
            </h2>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {dashboard.pendingApprovals.length} Actions Required
            </span>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {dashboard.pendingApprovals.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                All approval queues are completely clear! Zero pending
                bottlenecks.
              </div>
            ) : (
              dashboard.pendingApprovals.map((appr) => (
                <div
                  key={appr.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-medium ${urgencyBadge[appr.urgency]}`}
                      >
                        {appr.urgency}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {appr.code}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Requested by: {appr.requestedBy} · {appr.amountOrQuantity}{" "}
                      · {appr.submittedAt}
                    </p>
                  </div>
                  <Link
                    href={appr.approvalUrl}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 hover:border-blue-300"
                  >
                    Review & Authorize
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
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
            ],
            [
              "Global Search & Tracing",
              "Trace end-to-end lineage from indent to PO, GRN, bill, and Tally export.",
              "/search",
              Layers,
            ],
            [
              "Pending Approvals Matrix",
              "Drill down into department-wise approval aging and SLA timers.",
              "/reports/pending-approvals",
              Clock3,
            ],
          ].map(([title, description, href, NavIcon]) => (
            <Link
              key={href as string}
              href={href as string}
              className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
            >
              <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
                <NavIcon className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700">
                  {title as string}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {description as string}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Project Financial & Physical Position Matrix */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-slate-900">
          Active Project Financial & Physical Positions
        </h2>
        <p className="text-xs text-slate-500">
          Budget consumption, committed purchase orders, site stock valuation,
          and physical progress monitoring.
        </p>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.projectPositions.map((p) => (
                <tr key={p.projectId} className="hover:bg-slate-50/50">
                  <td className="py-3 px-3 font-semibold text-slate-900">
                    <div>{p.projectName}</div>
                    <span className="text-[10px] text-slate-500">
                      {p.projectCode}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    ₹{p.budgetTotal.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-slate-900 font-medium">
                    ₹{p.actualSpent.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-slate-600">
                    ₹{p.committedCost.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3 text-blue-700 font-medium">
                    ₹{p.stockValuation.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full"
                          style={{ width: `${p.physicalProgressPercent}%` }}
                        />
                      </div>
                      <span>{p.physicalProgressPercent}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
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
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.status === "ON_TRACK"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : p.status === "WARNING"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {p.status.replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Phase 12 Real-Time Data Pipeline · Refreshed at{" "}
        {new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }).format(new Date(dashboard.freshnessTimestamp))}
      </p>
    </main>
  );
}
