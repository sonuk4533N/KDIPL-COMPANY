import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Printer, Save } from "lucide-react";

import { ApplicationState } from "@/components/ui/states";
import {
  Table,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db/prisma";
import {
  canViewReport,
  getReportDefinition,
} from "@/features/reporting/report-catalog";
import { saveReportFilter } from "@/features/reporting/reporting-actions";
import { indianFinancialYear } from "@/features/reporting/reporting-domain";
import {
  reportRows,
  type ReportFilters,
} from "@/features/reporting/reporting-queries";
import { getReportingScope } from "@/features/reporting/reporting-scope";
import { requireCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

type Params = { reportId: string };
type Search = ReportFilters & { page?: string; saved?: string; print?: string };

export default async function ReportViewer({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const principal = await requireCurrentPrincipal();
  const { reportId } = await params;
  const definition = getReportDefinition(reportId);
  if (!definition) notFound();
  if (!canViewReport(principal, definition))
    return (
      <ApplicationState
        kind="forbidden"
        title="Report access denied"
        description="This report is outside your current permission and assignment scope."
      />
    );
  const requested = await searchParams;
  const saved = requested.saved
    ? await db.savedReportFilter.findFirst({
        where: {
          id: requested.saved,
          userId: principal.userId,
          reportType: reportId,
        },
      })
    : null;
  const savedFilters =
    saved?.filters &&
    typeof saved.filters === "object" &&
    !Array.isArray(saved.filters)
      ? (saved.filters as ReportFilters)
      : {};
  const currentFinancialYear = indianFinancialYear(new Date());
  const previousFinancialYear = `${String(Number(currentFinancialYear.slice(0, 2)) - 1).padStart(2, "0")}-${String(Number(currentFinancialYear.slice(3)) - 1).padStart(2, "0")}`;
  const filters: ReportFilters = {
    ...savedFilters,
    financialYear:
      requested.financialYear ??
      savedFilters.financialYear ??
      currentFinancialYear,
    projectId: requested.projectId ?? savedFilters.projectId,
    status: requested.status ?? savedFilters.status,
    from: requested.from ?? savedFilters.from,
    to: requested.to ?? savedFilters.to,
    asOf: requested.asOf ?? savedFilters.asOf,
  };
  const scope = await getReportingScope(principal);
  const [rows, projects] = await Promise.all([
    reportRows(principal, reportId, filters),
    hasPermission(principal, "project.view")
      ? db.project.findMany({
          where: scope.projectIds ? { id: { in: scope.projectIds } } : {},
          orderBy: { projectCode: "asc" },
          select: { id: true, projectCode: true, name: true },
        })
      : [],
  ]);
  if (definition.sensitive)
    await db.auditLog.create({
      data: {
        actorUserId: principal.userId,
        action: "VIEW",
        entityType: "Report",
        entityId: reportId,
        reason: "Sensitive report viewed",
        metadata: { filters },
      },
    });
  const page = Math.max(1, Number(requested.page) || 1);
  const pageSize = 50;
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  const columns = visible[0] ? Object.keys(visible[0]) : [];
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:block">
        <div>
          <Link
            href="/reports"
            className="text-sm font-semibold text-blue-700 print:hidden"
          >
            ← Report catalogue
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{definition.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ledger/source-derived · {rows.length} authorized rows · refreshed{" "}
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date())}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {["csv", "xlsx", "pdf"].map((format) => (
            <Link
              key={format}
              href={`/reports/export?report=${reportId}&format=${format}&${query}`}
              className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
            >
              <Download className="size-4" />
              {format.toUpperCase()}
            </Link>
          ))}
          <Link
            href={`/reports/${reportId}?${query}&print=1`}
            className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
          >
            <Printer className="size-4" /> Print
          </Link>
        </div>
      </div>
      <form className="sticky top-0 z-10 grid gap-3 rounded-xl border bg-white/95 p-4 shadow-sm backdrop-blur md:grid-cols-6 print:hidden">
        <select
          name="financialYear"
          defaultValue={filters.financialYear}
          className="rounded-lg border p-2 text-sm"
        >
          <option>{currentFinancialYear}</option>
          <option>{previousFinancialYear}</option>
        </select>
        <select
          name="projectId"
          defaultValue={filters.projectId ?? ""}
          className="rounded-lg border p-2 text-sm"
        >
          <option value="">All authorized projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.projectCode} · {project.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={filters.from}
          className="rounded-lg border p-2 text-sm"
          aria-label="From date"
        />
        <input
          type="date"
          name="to"
          defaultValue={filters.to}
          className="rounded-lg border p-2 text-sm"
          aria-label="To date"
        />
        <input
          name="status"
          defaultValue={filters.status}
          placeholder="Status"
          className="rounded-lg border p-2 text-sm"
        />
        {reportId === "stock-as-of" && (
          <input
            type="date"
            name="asOf"
            defaultValue={filters.asOf}
            aria-label="Stock as-of date"
            className="rounded-lg border p-2 text-sm"
          />
        )}
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Apply filters
        </button>
      </form>
      <form
        action={saveReportFilter}
        className="flex flex-wrap gap-2 print:hidden"
      >
        <input type="hidden" name="reportType" value={reportId} />
        {Object.entries(filters).map(([key, value]) =>
          value ? (
            <input key={key} type="hidden" name={key} value={value} />
          ) : null,
        )}
        <input
          name="name"
          required
          minLength={2}
          placeholder="Name this filter"
          className="rounded-lg border bg-white px-3 py-2 text-sm"
        />
        <button className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold">
          <Save className="size-4" /> Save filter
        </button>
      </form>
      {visible.length ? (
        <>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>
                      {column
                        .replaceAll(/([A-Z])/g, " $1")
                        .replaceAll("_", " ")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <tbody>
                {visible.map((row, index) => (
                  <TableRow key={index}>
                    {columns.map((column) => (
                      <TableCell key={column}>
                        {row[column] === null || row[column] === "" ? (
                          <span className="text-slate-400">Unavailable</span>
                        ) : (
                          String(row[column])
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </TableContainer>
          <div className="flex justify-between text-sm print:hidden">
            <span>
              Page {page} of {Math.max(1, Math.ceil(rows.length / pageSize))}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`?${query}&page=${page - 1}`}
                  className="rounded border px-3 py-1"
                >
                  Previous
                </Link>
              )}
              {page * pageSize < rows.length && (
                <Link
                  href={`?${query}&page=${page + 1}`}
                  className="rounded border px-3 py-1"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </>
      ) : (
        <ApplicationState
          kind="empty"
          title="No authorized records"
          description="No rows match these filters and your current data scope."
        />
      )}
      {requested.print === "1" && (
        <p className="text-xs text-slate-500">
          Print view · generated for {principal.displayName} ·{" "}
          {new Date().toISOString()}
        </p>
      )}
    </main>
  );
}
