import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";
import { toCsv, toPdf, toXlsx } from "@/server/finance/report-export";
import {
  financialReportRows,
  financialReportTypes,
  type FinancialReportType,
} from "@/server/finance/reports";

export async function GET(request: Request) {
  const principal = await getCurrentPrincipal();
  if (!principal) return new Response("Unauthorized", { status: 401 });
  if (!hasPermission(principal, "report.export"))
    return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const requested = url.searchParams.get("report") ?? "payables";
  const type = financialReportTypes.includes(requested as FinancialReportType)
    ? (requested as FinancialReportType)
    : "payables";
  const format = url.searchParams.get("format") ?? "csv";
  const rows = await financialReportRows(type);
  const filename = `kdipl-${type}-${new Date().toISOString().slice(0, 10)}`;
  if (format === "xlsx")
    return new Response(toXlsx(rows), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  if (format === "pdf")
    return new Response(toPdf(`KDIPL ${type} report`, rows), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
