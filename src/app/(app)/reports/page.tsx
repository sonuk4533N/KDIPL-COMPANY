import Link from "next/link";
import { ArrowRight, Download, Filter, Search } from "lucide-react";

import { ApplicationState } from "@/components/ui/states";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db/prisma";
import {
  canViewReport,
  reportCatalog,
} from "@/features/reporting/report-catalog";
import {
  configureValuationPolicy,
  deleteReportFilter,
} from "@/features/reporting/reporting-actions";
import { requireCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function ReportsPage() {
  const principal = await requireCurrentPrincipal();
  if (!hasPermission(principal, "report.view"))
    return (
      <ApplicationState
        kind="forbidden"
        title="Report access required"
        description="Your role does not include permission-scoped reporting."
      />
    );
  const available = reportCatalog.filter((report) =>
    canViewReport(principal, report),
  );
  const [saved, jobs, valuation] = await Promise.all([
    db.savedReportFilter.findMany({
      where: { userId: principal.userId },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
    db.reportExportJob.findMany({
      where: { requestedById: principal.userId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.stockValuationPolicy.findFirst({ orderBy: { effectiveFrom: "desc" } }),
  ]);
  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-blue-700">
            Phase 8 · authorized analytics
          </p>
          <h1 className="text-2xl font-semibold">Report catalogue</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every result and export reapplies your current server-side
            permissions.
          </p>
        </div>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
        >
          <Search className="size-4" /> Global search
        </Link>
      </div>
      {(!valuation || valuation.method === "QUANTITY_ONLY") && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>
            Stock monetary valuation is awaiting CA-approved policy.
          </strong>{" "}
          Quantity reports remain available.
        </div>
      )}
      {(["Inventory", "Procurement", "Accounts", "Management"] as const).map(
        (category) => {
          const rows = available.filter(
            (report) => report.category === category,
          );
          if (!rows.length) return null;
          return (
            <section key={category}>
              <h2 className="mb-3 font-display text-lg font-bold">
                {category}
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((report) => (
                  <Link
                    key={report.id}
                    href={`/reports/${report.id}`}
                    className="group rounded-xl border bg-white p-4 hover:border-blue-300"
                  >
                    <p className="font-semibold text-slate-900">
                      {report.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {report.description}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                      VIEW REPORT <ArrowRight className="size-3" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        },
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <Filter className="size-5 text-blue-700" />
              <h2 className="font-display font-bold">Saved filters</h2>
            </div>
            {saved.length ? (
              <div className="space-y-2">
                {saved.map((filter) => (
                  <div
                    key={filter.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"
                  >
                    <Link
                      className="font-semibold text-blue-700"
                      href={`/reports/${filter.reportType}?saved=${filter.id}`}
                    >
                      {filter.name}
                    </Link>
                    <form action={deleteReportFilter}>
                      <input type="hidden" name="id" value={filter.id} />
                      <button className="text-xs font-semibold text-red-700">
                        Delete
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No saved filters yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <Download className="size-5 text-blue-700" />
              <h2 className="font-display font-bold">Export history</h2>
            </div>
            {jobs.length ? (
              <div className="space-y-2">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"
                  >
                    <span>
                      {job.reportType} · {job.format.toUpperCase()}
                    </span>
                    <span className="font-semibold">
                      {job.status.replaceAll("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No exports requested.</p>
            )}
          </CardContent>
        </Card>
      </div>
      {principal.roleCodes.includes("ACCOUNTS_ADMIN") && (
        <Card>
          <CardContent>
            <h2 className="font-display font-bold">
              CA-approved stock valuation policy
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Effective-dated policy changes never rewrite historical reporting
              context.
            </p>
            <form
              action={configureValuationPolicy}
              className="mt-4 grid gap-3 md:grid-cols-4"
            >
              <select
                name="method"
                className="rounded-lg border p-2"
                defaultValue={valuation?.method ?? "QUANTITY_ONLY"}
              >
                <option value="QUANTITY_ONLY">Quantity only</option>
                <option value="MOVING_WEIGHTED_AVERAGE">
                  Moving weighted average
                </option>
                <option value="FIFO">FIFO</option>
                <option value="LAST_APPROVED_PURCHASE_RATE">
                  Last approved purchase rate
                </option>
              </select>
              <input
                required
                type="date"
                name="effectiveFrom"
                className="rounded-lg border p-2"
              />
              <input
                name="caReference"
                placeholder="CA approval reference"
                className="rounded-lg border p-2"
              />
              <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Save policy
              </button>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
