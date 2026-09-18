import { db } from "@/db/prisma";
import {
  canViewReport,
  getReportDefinition,
} from "@/features/reporting/report-catalog";
import { queueExportJob } from "@/features/reporting/reporting-actions";
import {
  reportRows,
  type ReportFilters,
} from "@/features/reporting/reporting-queries";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";
import { toCsv, toPdf, toXlsx } from "@/server/finance/report-export";

export async function GET(request: Request) {
  const principal = await getCurrentPrincipal();
  if (!principal) return new Response("Unauthorized", { status: 401 });
  if (!hasPermission(principal, "report.export"))
    return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const reportType = url.searchParams.get("report") ?? "";
  const definition = getReportDefinition(reportType);
  if (!definition || !canViewReport(principal, definition))
    return new Response("Forbidden", { status: 403 });
  const format = url.searchParams.get("format") ?? "csv";
  if (!["csv", "xlsx", "pdf"].includes(format))
    return new Response("Unsupported format", { status: 400 });
  const filters: ReportFilters = Object.fromEntries(
    ["financialYear", "projectId", "status", "from", "to", "asOf"].map(
      (key) => [key, url.searchParams.get(key) ?? undefined],
    ),
  );
  const job = await queueExportJob({ reportType, format, filters });
  await db.reportExportJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING", startedAt: new Date(), error: null },
  });
  try {
    const rows = await reportRows(principal, reportType, filters);
    const generatedAt = new Date();
    const metadata = [
      {
        report: definition.name,
        generatedAt: generatedAt.toISOString(),
        generatedFor: principal.displayName,
        financialYear: job.financialYear,
      },
      ...rows,
    ];
    const body =
      format === "xlsx"
        ? toXlsx(metadata)
        : format === "pdf"
          ? toPdf(`KDIPL · ${definition.name}`, metadata)
          : Buffer.from(toCsv(metadata));
    await db.$transaction(async (tx) => {
      await tx.reportExportJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          rowCount: rows.length,
          completedAt: generatedAt,
          expiresAt: new Date(generatedAt.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "EXPORT",
          entityType: "ReportExportJob",
          entityId: job.id,
          reason: "Report export completed",
          metadata: { reportType, format, rowCount: rows.length },
        },
      });
    });
    const type =
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : format === "pdf"
          ? "application/pdf"
          : "text/csv; charset=utf-8";
    return new Response(body, {
      headers: {
        "content-type": type,
        "content-disposition": `attachment; filename="kdipl-${reportType}-${generatedAt.toISOString().slice(0, 10)}.${format}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    await db.reportExportJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Export failed",
      },
    });
    return new Response("Export failed", { status: 500 });
  }
}
