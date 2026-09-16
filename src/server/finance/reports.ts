import "server-only";

import { db } from "@/db/prisma";
import type { ReportRow } from "./report-export";

export const financialReportTypes = [
  "payables",
  "ageing",
  "payments",
  "gst",
  "tds",
  "rcm",
  "notes",
  "advances",
  "mismatches",
  "invoice-approvals",
  "payment-approvals",
  "project-cost",
  "work-package-budget",
  "tally",
] as const;
export type FinancialReportType = (typeof financialReportTypes)[number];

export async function financialReportRows(
  type: FinancialReportType,
): Promise<ReportRow[]> {
  if (type === "payments" || type === "payment-approvals") {
    const rows = await db.supplierPayment.findMany({
      where: type === "payment-approvals" ? { status: "PENDING_APPROVAL" } : {},
      orderBy: { paymentDate: "desc" },
    });
    return rows.map((row) => ({
      paymentNumber: row.paymentNumber,
      invoiceId: row.invoiceId,
      method: row.method,
      amount: row.amount.toString(),
      status: row.status,
      paymentDate: row.paymentDate.toISOString().slice(0, 10),
      reference: row.referenceNumber ?? row.chequeNumber,
    }));
  }
  if (type === "notes") {
    const rows = await db.supplierFinancialNote.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      noteNumber: row.noteNumber,
      type: row.noteType,
      invoiceId: row.invoiceId,
      reason: row.reasonCode,
      taxableValue: row.taxableValue.toString(),
      tax: row.taxAmount.toString(),
      total: row.totalAmount.toString(),
      status: row.status,
    }));
  }
  if (type === "advances") {
    const rows = await db.supplierAdvance.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      advanceNumber: row.advanceNumber,
      purchaseOrderId: row.purchaseOrderId,
      amount: row.approvedAmount.toString(),
      applied: row.appliedAmount.toString(),
      remaining: row.approvedAmount
        .minus(row.appliedAmount)
        .minus(row.refundedAmount)
        .toString(),
      status: row.status,
    }));
  }
  if (type === "mismatches") {
    const rows = await db.invoiceMismatch.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      invoiceId: row.invoiceId,
      field: row.field,
      expected: row.expectedValue,
      actual: row.actualValue,
      status: row.status,
      reviewReason: row.reviewReason,
    }));
  }
  if (type === "project-cost") {
    const [projects, actuals, orders] = await Promise.all([
      db.project.findMany({
        select: {
          id: true,
          projectCode: true,
          name: true,
          procurementBudget: true,
        },
      }),
      db.projectCostAllocation.groupBy({
        by: ["projectId"],
        _sum: { amount: true },
      }),
      db.purchaseOrder.findMany({
        where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
        select: {
          totalAmount: true,
          rfq: { select: { requirement: { select: { projectId: true } } } },
        },
      }),
    ]);
    const actualByProject = new Map(
      actuals.map((row) => [row.projectId, row._sum.amount ?? 0]),
    );
    const committedByProject = new Map<string, number>();
    for (const order of orders) {
      const projectId = order.rfq.requirement.projectId;
      committedByProject.set(
        projectId,
        (committedByProject.get(projectId) ?? 0) + order.totalAmount.toNumber(),
      );
    }
    return projects.map((project) => {
      const actual = actualByProject.get(project.id);
      const remaining = project.procurementBudget
        ? project.procurementBudget.minus(actual ?? 0)
        : null;
      return {
        projectCode: project.projectCode,
        project: project.name,
        budget: project.procurementBudget?.toString() ?? null,
        committedPurchaseOrders: String(
          committedByProject.get(project.id) ?? 0,
        ),
        actualInvoices: String(actual ?? 0),
        remaining: remaining?.toString() ?? null,
        warning: remaining?.isNegative() ? "OVER BUDGET" : "",
      };
    });
  }
  if (type === "work-package-budget") {
    const [orderLines, actuals] = await Promise.all([
      db.purchaseOrderLine.findMany({
        where: { purchaseOrder: { status: { notIn: ["DRAFT", "CANCELLED"] } } },
        select: {
          lineSubtotal: true,
          requirementLine: {
            select: {
              requirement: {
                select: {
                  project: {
                    select: {
                      id: true,
                      projectCode: true,
                      name: true,
                      procurementBudget: true,
                    },
                  },
                  site: { select: { siteCode: true, name: true } },
                },
              },
            },
          },
        },
      }),
      db.projectCostAllocation.groupBy({
        by: ["projectId", "workPackage"],
        _sum: { amount: true },
      }),
    ]);
    const groups = new Map<
      string,
      ReportRow & { committed: number; actual: number }
    >();
    for (const line of orderLines) {
      const requirement = line.requirementLine.requirement;
      const workPackage = `${requirement.site.siteCode} · ${requirement.site.name}`;
      const key = `${requirement.project.id}:${workPackage}`;
      const row = groups.get(key) ?? {
        projectCode: requirement.project.projectCode,
        project: requirement.project.name,
        workPackage,
        projectBudget:
          requirement.project.procurementBudget?.toString() ?? null,
        committed: 0,
        actual: 0,
      };
      row.committed += line.lineSubtotal.toNumber();
      groups.set(key, row);
    }
    for (const actual of actuals) {
      const key = `${actual.projectId}:${actual.workPackage ?? "Unassigned"}`;
      const row = groups.get(key);
      if (row) row.actual = actual._sum.amount?.toNumber() ?? 0;
    }
    return [...groups.values()].map((row) => ({
      projectCode: row.projectCode,
      project: row.project,
      workPackage: row.workPackage,
      projectBudget: row.projectBudget,
      committed: row.committed.toFixed(2),
      actual: row.actual.toFixed(2),
      commitmentRemaining: (row.committed - row.actual).toFixed(2),
    }));
  }
  if (type === "tally") {
    const rows = await db.tallyExportEvent.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      exportNumber: row.exportNumber,
      entityType: row.entityType,
      entityId: row.entityId,
      status: row.status,
      checksum: row.checksum,
      attempts: row.attemptCount,
      error: row.lastError,
    }));
  }

  const statusFilter =
    type === "invoice-approvals"
      ? ["MD_APPROVAL_PENDING"]
      : ["APPROVED", "PARTIALLY_PAID", "PAID", "PAYMENT_HOLD"];
  const rcmInvoiceIds =
    type === "rcm"
      ? new Set(
          (
            await db.supplierInvoiceLine.findMany({
              where: { reverseCharge: true },
              select: { invoiceId: true },
              distinct: ["invoiceId"],
            })
          ).map((line) => line.invoiceId),
        )
      : null;
  const invoices = await db.supplierInvoice.findMany({
    where: statusFilter ? { status: { in: statusFilter } } : {},
    orderBy: { dueDate: "asc" },
  });
  const now = Date.now();
  return invoices
    .filter((invoice) => {
      if (type === "gst")
        return invoice.cgstAmount
          .plus(invoice.sgstAmount)
          .plus(invoice.igstAmount)
          .gt(0);
      if (type === "tds") return invoice.tdsAmount.gt(0);
      if (type === "rcm") return rcmInvoiceIds?.has(invoice.id) ?? false;
      if (["payables", "ageing"].includes(type)) {
        const outstanding = (invoice.approvedPayable ?? invoice.invoiceTotal)
          .plus(invoice.debitApplied)
          .minus(invoice.paidAmount)
          .minus(invoice.creditApplied)
          .minus(invoice.advanceApplied);
        return outstanding.gt(0);
      }
      return true;
    })
    .map((invoice) => {
      const outstanding = (invoice.approvedPayable ?? invoice.invoiceTotal)
        .plus(invoice.debitApplied)
        .minus(invoice.paidAmount)
        .minus(invoice.creditApplied)
        .minus(invoice.advanceApplied);
      const overdueDays = Math.max(
        0,
        Math.floor((now - invoice.dueDate.getTime()) / 86_400_000),
      );
      return {
        internalNumber: invoice.internalNumber,
        supplierInvoiceNumber: invoice.supplierInvoiceNumber,
        financialYear: invoice.financialYear,
        invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        status: invoice.status,
        taxableValue: invoice.taxableValue.toString(),
        cgst: invoice.cgstAmount.toString(),
        sgst: invoice.sgstAmount.toString(),
        igst: invoice.igstAmount.toString(),
        cess: invoice.cessAmount.toString(),
        tds: invoice.tdsAmount.toString(),
        total: invoice.invoiceTotal.toString(),
        outstanding: outstanding.toString(),
        ageingDays: type === "ageing" ? overdueDays : "",
      };
    });
}
