import "server-only";

import { db } from "@/db/prisma";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";

export async function getFinanceWorkspace(principal: AuthenticatedPrincipal) {
  requirePermission(principal, "invoice.view");
  if (
    !principal.roleCodes.some((role) =>
      [
        "ACCOUNTS",
        "ACCOUNTS_ADMIN",
        "MANAGING_DIRECTOR",
        "SYSTEM_ADMINISTRATOR",
      ].includes(role),
    )
  )
    throw new AppError("FORBIDDEN");

  const [
    suppliers,
    purchaseOrders,
    poLines,
    goodsReceipts,
    grnLines,
    materials,
    units,
    taxRules,
    files,
    invoices,
    invoiceLines,
    mismatches,
    payments,
    advances,
    notes,
    exports,
    banks,
    projects,
    costs,
  ] = await Promise.all([
    db.supplier.findMany({
      where: { isActive: true },
      orderBy: { legalName: "asc" },
    }),
    db.purchaseOrder.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    db.purchaseOrderLine.findMany({
      orderBy: { position: "asc" },
      include: { requirementLine: { select: { materialId: true } } },
    }),
    db.goodsReceipt.findMany({
      where: { status: "POSTED" },
      orderBy: { postedAt: "desc" },
      take: 300,
    }),
    db.goodsReceiptLine.findMany(),
    db.material.findMany({
      select: { id: true, name: true, materialCode: true },
    }),
    db.unitOfMeasure.findMany({ select: { id: true, symbol: true } }),
    db.taxRuleVersion.findMany({
      orderBy: [{ kind: "asc" }, { effectiveFrom: "desc" }],
    }),
    db.fileRecord.findMany({
      where: {
        scanStatus: "CLEAN",
        documentType: {
          in: [
            "SUPPLIER_INVOICE",
            "PAYMENT_PROOF",
            "ADVANCE_PAYMENT_EVIDENCE",
            "CREDIT_NOTE",
            "DEBIT_NOTE",
          ],
        },
        retentionUntil: { gt: new Date() },
      },
      orderBy: { uploadedAt: "desc" },
      take: 200,
    }),
    db.supplierInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 250 }),
    db.supplierInvoiceLine.findMany({ orderBy: { position: "asc" } }),
    db.invoiceMismatch.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    db.supplierPayment.findMany({ orderBy: { createdAt: "desc" }, take: 250 }),
    db.supplierAdvance.findMany({ orderBy: { createdAt: "desc" }, take: 250 }),
    db.supplierFinancialNote.findMany({
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    db.tallyExportEvent.findMany({ orderBy: { createdAt: "desc" }, take: 250 }),
    db.companyBankAccount.findMany({
      where: { isActive: true },
      orderBy: { bankName: "asc" },
    }),
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
  ]);

  const supplierById = new Map(
    suppliers.map((supplier) => [supplier.id, supplier]),
  );
  const poById = new Map(purchaseOrders.map((po) => [po.id, po]));
  const materialById = new Map(
    materials.map((material) => [material.id, material]),
  );
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const grnById = new Map(goodsReceipts.map((grn) => [grn.id, grn]));
  const actualByProject = new Map(
    costs.map((cost) => [cost.projectId, cost._sum.amount?.toString() ?? "0"]),
  );

  return {
    roleCodes: [...principal.roleCodes],
    permissions: [...principal.permissions],
    suppliers: suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.legalName,
      gstin: supplier.gstin,
      registered: supplier.isGstRegistered,
      unregisteredApproved: supplier.accountsApprovedUnregistered,
      state: supplier.state,
      creditDays: supplier.defaultCreditDays,
    })),
    purchaseOrders: purchaseOrders.map((po) => ({
      id: po.id,
      number: po.poNumber,
      supplierId: po.supplierId,
      total: po.totalAmount.toString(),
      gstRate: po.gstRate.toString(),
      creditDays: po.creditDays,
      permitsAdvance: po.permitsAdvance,
      maximumAdvancePercent: po.maximumAdvancePercent?.toString() ?? null,
    })),
    poLines: poLines.map((line) => ({
      id: line.id,
      purchaseOrderId: line.purchaseOrderId,
      poNumber: poById.get(line.purchaseOrderId)?.poNumber ?? "Unavailable PO",
      materialId: line.requirementLine.materialId,
      unitId: line.unitId,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
    })),
    grns: goodsReceipts.map((grn) => ({
      id: grn.id,
      number: grn.grnNumber,
      purchaseOrderId: grn.purchaseOrderId,
    })),
    grnLines: grnLines.map((line) => ({
      id: line.id,
      goodsReceiptId: line.goodsReceiptId,
      grnNumber:
        grnById.get(line.goodsReceiptId)?.grnNumber ?? "Unavailable GRN",
      purchaseOrderLineId: line.purchaseOrderLineId,
      material: materialById.get(line.materialId)?.name ?? "Material",
      acceptedQuantity: line.acceptedQuantity.toString(),
    })),
    taxRules: taxRules.map((rule) => ({
      id: rule.id,
      code: rule.code,
      kind: rule.kind,
      rate: rule.rate.toString(),
      effectiveFrom: rule.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: rule.effectiveTo?.toISOString().slice(0, 10) ?? null,
    })),
    files: files.map((file) => ({
      id: file.id,
      name: file.filename,
      type: file.documentType,
    })),
    invoices: invoices.map((invoice) => {
      const approved = invoice.approvedPayable ?? invoice.invoiceTotal;
      const outstanding = approved
        .plus(invoice.debitApplied)
        .minus(invoice.paidAmount)
        .minus(invoice.creditApplied)
        .minus(invoice.advanceApplied);
      return {
        id: invoice.id,
        number: invoice.internalNumber,
        supplierInvoiceNumber: invoice.supplierInvoiceNumber,
        supplier: supplierById.get(invoice.supplierId)?.legalName ?? "Supplier",
        supplierId: invoice.supplierId,
        status: invoice.status,
        date: invoice.invoiceDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        total: invoice.invoiceTotal.toString(),
        outstanding: outstanding.toString(),
        documentId: invoice.documentId,
        createdById: invoice.createdById,
        verifiedById: invoice.verifiedById,
      };
    }),
    invoiceLines: invoiceLines.map((line) => ({
      id: line.id,
      invoiceId: line.invoiceId,
      hsnSac: line.hsnSac,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      taxableValue: line.taxableValue.toString(),
      gstRate: line.gstRate.toString(),
      taxRuleVersionId: line.taxRuleVersionId,
      matchStatus: line.matchStatus,
      material: materialById.get(line.materialId)?.name ?? "Material",
      unit: unitById.get(line.unitId)?.symbol ?? "unit",
    })),
    mismatches: mismatches.map((mismatch) => ({
      id: mismatch.id,
      invoiceId: mismatch.invoiceId,
      field: mismatch.field,
      expected: mismatch.expectedValue,
      actual: mismatch.actualValue,
      status: mismatch.status,
      reason: mismatch.reviewReason,
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      number: payment.paymentNumber,
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoiceId
        ? (invoiceById.get(payment.invoiceId)?.internalNumber ?? "Invoice")
        : null,
      method: payment.method,
      amount: payment.amount.toString(),
      status: payment.status,
      preparedById: payment.preparedById,
      clearanceStatus: payment.clearanceStatus,
      reversalOfId: payment.reversalOfId,
      reversalOfNumber: payment.reversalOfId
        ? (paymentById.get(payment.reversalOfId)?.paymentNumber ??
          "Original payment")
        : null,
    })),
    advances: advances.map((advance) => ({
      id: advance.id,
      number: advance.advanceNumber,
      supplier: supplierById.get(advance.supplierId)?.legalName ?? "Supplier",
      purchaseOrder: poById.get(advance.purchaseOrderId)?.poNumber ?? "PO",
      status: advance.status,
      amount: advance.approvedAmount.toString(),
      remaining: advance.approvedAmount
        .minus(advance.appliedAmount)
        .minus(advance.refundedAmount)
        .toString(),
      preparedById: advance.preparedById,
    })),
    notes: notes.map((note) => ({
      id: note.id,
      number: note.noteNumber,
      type: note.noteType,
      invoiceNumber:
        invoiceById.get(note.invoiceId)?.internalNumber ?? "Invoice",
      status: note.status,
      total: note.totalAmount.toString(),
      applied: note.appliedAmount.toString(),
      remaining: note.totalAmount.minus(note.appliedAmount).toString(),
      reason: note.reason,
      createdById: note.createdById,
    })),
    exports: exports.map((event) => ({
      id: event.id,
      number: event.exportNumber,
      entityType: event.entityType,
      status: event.status,
      attempts: event.attemptCount,
      error: event.lastError,
    })),
    banks: banks.map((bank) => ({
      id: bank.id,
      name: `${bank.bankName} · ${bank.maskedAccount}`,
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: `${project.projectCode} · ${project.name}`,
      budget: project.procurementBudget?.toString() ?? null,
      actual: actualByProject.get(project.id) ?? "0",
    })),
  };
}

export type FinanceWorkspace = Awaited<ReturnType<typeof getFinanceWorkspace>>;
