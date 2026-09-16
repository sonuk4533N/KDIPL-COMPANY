import "server-only";

import { db } from "@/db/prisma";
import { Prisma, type AuditAction } from "@/generated/prisma/client";
import { AuditService } from "@/server/audit/audit-service";
import {
  assertInvoiceTransition,
  calculateDueDate,
  calculateInvoiceLine,
  calculateInvoiceTotal,
  indianFinancialYear,
  normalizeSupplierInvoiceNumber,
  type InvoiceState,
} from "@/server/finance/domain";
import { nextFinanceNumber } from "@/server/finance/numbering";
import {
  accountRoles,
  requireFinanceRole,
  requireReason,
} from "@/server/finance/policy";
import { queueTallyExport } from "@/server/finance/tally-export";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";
import {
  invoiceCommandSchema,
  invoiceDraftSchema,
  type InvoiceCommandInput,
  type InvoiceDraftInput,
} from "./finance-schemas";

type Tx = Prisma.TransactionClient;
const D = (value: string | number | Prisma.Decimal) =>
  new Prisma.Decimal(value);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError("VALIDATION_ERROR", message);
}

async function requireCleanDocument(tx: Tx, documentId: string | undefined) {
  if (!documentId) return;
  const file = await tx.fileRecord.findFirst({
    where: {
      id: documentId,
      documentType: "SUPPLIER_INVOICE",
      scanStatus: "CLEAN",
      retentionUntil: { gt: new Date() },
    },
    select: { id: true },
  });
  assert(file, "Use a clean retained supplier-invoice document.");
}

async function workflow(
  tx: Tx,
  principal: AuthenticatedPrincipal,
  invoiceId: string,
  action: string,
  fromStatus: string,
  toStatus: string,
  reason?: string,
) {
  await tx.financeWorkflowEvent.create({
    data: {
      entityType: "SUPPLIER_INVOICE",
      entityId: invoiceId,
      action,
      fromStatus,
      toStatus,
      actorUserId: principal.userId,
      reason,
    },
  });
  const auditAction: AuditAction =
    action === "SUBMIT"
      ? "SUBMIT"
      : action === "VERIFY"
        ? "VERIFY"
        : action === "APPROVE"
          ? "APPROVE"
          : action === "REJECT"
            ? "REJECT"
            : action === "CANCEL"
              ? "CANCEL"
              : "UPDATE";
  await AuditService.record(
    {
      actorUserId: principal.userId,
      action: auditAction,
      entityType: "SupplierInvoice",
      entityId: invoiceId,
      before: { status: fromStatus },
      after: { status: toStatus },
      reason,
    },
    tx,
  );
}

async function notification(
  tx: Tx,
  eventType: string,
  invoiceId: string,
  recipientRole: string,
  payload: Prisma.InputJsonValue,
) {
  const now = Date.now();
  await tx.notificationOutbox.create({
    data: {
      eventType,
      entityType: "SUPPLIER_INVOICE",
      entityId: invoiceId,
      recipientRole,
      channels: ["IN_APP", "WHATSAPP"],
      payload,
      remindAt: new Date(now + 24 * 60 * 60_000),
      escalateAt: new Date(now + 48 * 60 * 60_000),
    },
  });
}

async function writeDraft(
  tx: Tx,
  principal: AuthenticatedPrincipal,
  input: InvoiceDraftInput,
  invoiceId?: string,
) {
  await requireFinanceRole(tx, principal, accountRoles);
  const invoiceDate = new Date(`${input.invoiceDate}T00:00:00.000Z`);
  const financialYear = indianFinancialYear(invoiceDate).code;
  const supplier = await tx.supplier.findFirst({
    where: { id: input.supplierId, isActive: true },
  });
  assert(supplier, "Select an active supplier.");
  assert(
    supplier.isGstRegistered
      ? !!supplier.gstin
      : supplier.accountsApprovedUnregistered,
    "The supplier must have a GSTIN or Accounts approval as an unregistered supplier.",
  );
  const supplierIdentityKey = supplier.isGstRegistered
    ? `GSTIN:${supplier.gstin!.trim().toUpperCase()}`
    : `UNREGISTERED:${supplier.id}`;
  const normalizedInvoiceNumber = normalizeSupplierInvoiceNumber(
    input.supplierInvoiceNumber,
  );
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice:${supplierIdentityKey}:${normalizedInvoiceNumber}:${financialYear}`}))::text`;

  const purchaseOrders = await tx.purchaseOrder.findMany({
    where: { id: { in: input.purchaseOrderIds } },
  });
  assert(
    purchaseOrders.length === new Set(input.purchaseOrderIds).size,
    "One or more purchase orders no longer exist.",
  );
  assert(
    purchaseOrders.every(
      (po) =>
        po.supplierId === supplier.id &&
        !["DRAFT", "CANCELLED"].includes(po.status),
    ),
    "Every linked purchase order must be issued and belong to the invoice supplier.",
  );

  const goodsReceipts = await tx.goodsReceipt.findMany({
    where: { id: { in: input.goodsReceiptIds } },
  });
  assert(
    goodsReceipts.length === new Set(input.goodsReceiptIds).size &&
      goodsReceipts.every(
        (grn) =>
          grn.status === "POSTED" &&
          input.purchaseOrderIds.includes(grn.purchaseOrderId),
      ),
    "Only posted GRNs belonging to the linked purchase orders are eligible.",
  );

  const poLineIds = input.lines.map((line) => line.purchaseOrderLineId);
  const poLines = await tx.purchaseOrderLine.findMany({
    where: { id: { in: poLineIds } },
    include: {
      purchaseOrder: true,
      requirementLine: {
        select: {
          materialId: true,
          requirement: { select: { projectId: true } },
        },
      },
    },
  });
  assert(
    poLines.length === new Set(poLineIds).size,
    "Invalid purchase-order line.",
  );
  const poLineById = new Map(poLines.map((line) => [line.id, line]));

  const allocationIds = input.lines.flatMap((line) =>
    line.allocations.map((allocation) => allocation.goodsReceiptLineId),
  );
  const grnLines = await tx.goodsReceiptLine.findMany({
    where: { id: { in: allocationIds } },
    include: { goodsReceipt: true },
  });
  const grnLineById = new Map(grnLines.map((line) => [line.id, line]));

  const taxRuleIds = Array.from(
    new Set(
      input.lines.flatMap((line) =>
        [
          line.taxRuleVersionId,
          line.tdsRuleVersionId,
          line.cessRuleVersionId,
        ].filter((id): id is string => !!id),
      ),
    ),
  );
  const taxRules = await tx.taxRuleVersion.findMany({
    where: { id: { in: taxRuleIds } },
  });
  const ruleById = new Map(taxRules.map((rule) => [rule.id, rule]));
  const activeRule = (id: string | undefined, kind: string) => {
    if (!id) return undefined;
    const rule = ruleById.get(id);
    assert(rule?.kind === kind, `Select a valid ${kind} rule.`);
    assert(
      rule.effectiveFrom <= invoiceDate &&
        (!rule.effectiveTo || rule.effectiveTo >= invoiceDate),
      `${kind} rule is not effective on the invoice date.`,
    );
    return rule;
  };

  const calculatedLines = input.lines.map((line, position) => {
    const poLine = poLineById.get(line.purchaseOrderLineId)!;
    assert(
      input.purchaseOrderIds.includes(poLine.purchaseOrderId),
      "Invoice line does not belong to a linked purchase order.",
    );
    const allocations = line.allocations.map((allocation) => {
      const grnLine = grnLineById.get(allocation.goodsReceiptLineId);
      assert(
        grnLine &&
          input.goodsReceiptIds.includes(grnLine.goodsReceiptId) &&
          grnLine.purchaseOrderLineId === poLine.id &&
          grnLine.goodsReceipt.status === "POSTED",
        "Each allocation must use a posted GRN line for the same PO line.",
      );
      return allocation;
    });
    assert(
      allocations
        .reduce((total, allocation) => total.plus(D(allocation.quantity)), D(0))
        .eq(D(line.quantity)),
      "GRN allocation quantity must equal the invoice-line quantity.",
    );
    const gst = activeRule(line.taxRuleVersionId, "GST")!;
    const tds = activeRule(line.tdsRuleVersionId, "TDS");
    const cess = activeRule(line.cessRuleVersionId, "CESS");
    const calculation = calculateInvoiceLine({
      ...line,
      gstRate: gst.rate,
      tdsRate: tds?.rate ?? 0,
      cessRate: cess?.rate ?? 0,
      supplierState: supplier.state,
      placeOfSupply: input.placeOfSupply,
    });
    return { line, poLine, allocations, calculation, gst, tds, cess, position };
  });
  const total = calculateInvoiceTotal(
    calculatedLines.map((line) => line.calculation),
    input.roundOff,
  );
  const creditDays =
    input.creditTermsSource === "PURCHASE_ORDER"
      ? purchaseOrders[0]?.creditDays
      : supplier.defaultCreditDays;
  assert(
    creditDays !== null && creditDays !== undefined,
    "The selected purchase order has no structured credit terms.",
  );
  if (input.creditTermsSource === "PURCHASE_ORDER")
    assert(
      purchaseOrders.every((po) => po.creditDays === creditDays),
      "Linked purchase orders must use the same credit terms.",
    );
  const calculatedDueDate = calculateDueDate(invoiceDate, creditDays);
  const dueDate = input.dueDate
    ? new Date(`${input.dueDate}T00:00:00.000Z`)
    : calculatedDueDate;
  if (dueDate.getTime() !== calculatedDueDate.getTime())
    requireReason(input.dueDateOverrideReason, "DUE_DATE_OVERRIDE");
  await requireCleanDocument(tx, input.documentId);
  const taxRuleSnapshot = calculatedLines.map(({ gst, tds, cess }) => ({
    gst: { id: gst.id, code: gst.code, rate: gst.rate.toString() },
    tds: tds ? { id: tds.id, code: tds.code, rate: tds.rate.toString() } : null,
    cess: cess
      ? { id: cess.id, code: cess.code, rate: cess.rate.toString() }
      : null,
  })) as Prisma.InputJsonValue;

  let invoice;
  if (invoiceId) {
    const existing = await tx.supplierInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    assert(existing.status === "DRAFT", "Only draft invoices may be edited.");
    assert(
      existing.createdById === principal.userId,
      "Only the draft creator may edit it.",
    );
    const oldLines = await tx.supplierInvoiceLine.findMany({
      where: { invoiceId },
      select: { id: true },
    });
    await tx.supplierInvoiceAllocation.deleteMany({
      where: { invoiceLineId: { in: oldLines.map((line) => line.id) } },
    });
    await tx.invoiceMismatch.deleteMany({ where: { invoiceId } });
    await tx.supplierInvoiceLine.deleteMany({ where: { invoiceId } });
    await tx.supplierInvoicePurchaseOrder.deleteMany({ where: { invoiceId } });
    await tx.supplierInvoiceGoodsReceipt.deleteMany({ where: { invoiceId } });
    invoice = await tx.supplierInvoice.update({
      where: { id: invoiceId },
      data: {
        supplierId: supplier.id,
        supplierIdentityKey,
        supplierInvoiceNumber: input.supplierInvoiceNumber,
        normalizedInvoiceNumber,
        invoiceDate,
        financialYear,
        placeOfSupply: input.placeOfSupply,
        calculatedDueDate,
        dueDate,
        creditTermsSource: input.creditTermsSource,
        dueDateOverrideReason: input.dueDateOverrideReason,
        taxableValue: total.taxableValue,
        cgstAmount: total.cgst,
        sgstAmount: total.sgst,
        igstAmount: total.igst,
        cessAmount: total.cess,
        tdsAmount: total.tds,
        roundOff: total.roundOff,
        invoiceTotal: total.total,
        taxRuleSnapshot,
        remarks: input.remarks,
        documentId: input.documentId,
      },
    });
  } else {
    invoice = await tx.supplierInvoice.create({
      data: {
        internalNumber: await nextFinanceNumber(tx, "INVOICE", invoiceDate),
        supplierId: supplier.id,
        supplierIdentityKey,
        supplierInvoiceNumber: input.supplierInvoiceNumber,
        normalizedInvoiceNumber,
        invoiceDate,
        financialYear,
        placeOfSupply: input.placeOfSupply,
        calculatedDueDate,
        dueDate,
        creditTermsSource: input.creditTermsSource,
        dueDateOverrideReason: input.dueDateOverrideReason,
        taxableValue: total.taxableValue,
        cgstAmount: total.cgst,
        sgstAmount: total.sgst,
        igstAmount: total.igst,
        cessAmount: total.cess,
        tdsAmount: total.tds,
        roundOff: total.roundOff,
        invoiceTotal: total.total,
        taxRuleSnapshot,
        remarks: input.remarks,
        documentId: input.documentId,
        createdById: principal.userId,
      },
    });
  }
  await tx.supplierInvoicePurchaseOrder.createMany({
    data: input.purchaseOrderIds.map((purchaseOrderId) => ({
      invoiceId: invoice.id,
      purchaseOrderId,
    })),
  });
  await tx.supplierInvoiceGoodsReceipt.createMany({
    data: input.goodsReceiptIds.map((goodsReceiptId) => ({
      invoiceId: invoice.id,
      goodsReceiptId,
    })),
  });
  for (const item of calculatedLines) {
    const line = await tx.supplierInvoiceLine.create({
      data: {
        invoiceId: invoice.id,
        purchaseOrderLineId: item.poLine.id,
        materialId: item.poLine.requirementLine.materialId,
        unitId: item.poLine.unitId,
        hsnSac: item.line.hsnSac,
        taxRuleVersionId: item.gst.id,
        tdsRuleVersionId: item.tds?.id,
        cessRuleVersionId: item.cess?.id,
        quantity: item.line.quantity,
        unitPrice: item.line.unitPrice,
        discountBeforeTax: item.line.discountBeforeTax,
        discountAfterTax: item.line.discountAfterTax,
        freightAmount: item.line.freightAmount,
        freightTaxable: item.line.freightTaxable,
        taxableValue: item.calculation.taxableValue,
        gstRate: item.gst.rate,
        cgstAmount: item.calculation.cgst,
        sgstAmount: item.calculation.sgst,
        igstAmount: item.calculation.igst,
        cessRate: item.cess?.rate ?? 0,
        cessAmount: item.calculation.cess,
        tdsRate: item.tds?.rate ?? 0,
        tdsAmount: item.calculation.tds,
        reverseCharge: item.line.reverseCharge,
        inputTaxCreditEligible: item.line.inputTaxCreditEligible,
        linePayable: item.calculation.supplierPayable,
        position: item.position,
      },
    });
    await tx.supplierInvoiceAllocation.createMany({
      data: item.allocations.map((allocation) => ({
        invoiceLineId: line.id,
        goodsReceiptLineId: allocation.goodsReceiptLineId,
        quantity: allocation.quantity,
      })),
    });
  }
  await AuditService.record(
    {
      actorUserId: principal.userId,
      action: invoiceId ? "UPDATE" : "CREATE",
      entityType: "SupplierInvoice",
      entityId: invoice.id,
      after: {
        number: invoice.internalNumber,
        supplierInvoiceNumber: invoice.supplierInvoiceNumber,
        invoiceTotal: invoice.invoiceTotal,
        dueDate: invoice.dueDate,
      },
      reason: input.dueDateOverrideReason,
    },
    tx,
  );
  return { id: invoice.id, number: invoice.internalNumber };
}

async function lineMismatches(tx: Tx, invoiceId: string) {
  const invoice = await tx.supplierInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });
  const links = await tx.supplierInvoicePurchaseOrder.findMany({
    where: { invoiceId },
  });
  const poIds = links.map((link) => link.purchaseOrderId);
  const purchaseOrders = await tx.purchaseOrder.findMany({
    where: { id: { in: poIds } },
  });
  const poById = new Map(purchaseOrders.map((po) => [po.id, po]));
  const lines = await tx.supplierInvoiceLine.findMany({
    where: { invoiceId },
    orderBy: { position: "asc" },
  });
  const poLines = await tx.purchaseOrderLine.findMany({
    where: { id: { in: lines.map((line) => line.purchaseOrderLineId) } },
    include: { requirementLine: { select: { materialId: true } } },
  });
  const poLineById = new Map(poLines.map((line) => [line.id, line]));
  const result: Array<{
    invoiceLineId?: string;
    field: string;
    expectedValue: string;
    actualValue: string;
  }> = [];
  const add = (
    invoiceLineId: string | undefined,
    field: string,
    expectedValue: unknown,
    actualValue: unknown,
  ) => {
    if (String(expectedValue) !== String(actualValue))
      result.push({
        invoiceLineId,
        field,
        expectedValue: String(expectedValue),
        actualValue: String(actualValue),
      });
  };

  for (const line of lines) {
    const poLine = poLineById.get(line.purchaseOrderLineId)!;
    const po = poById.get(poLine.purchaseOrderId)!;
    add(line.id, "supplier", po.supplierId, invoice.supplierId);
    add(
      line.id,
      "material",
      poLine.requirementLine.materialId,
      line.materialId,
    );
    add(line.id, "unit", poLine.unitId, line.unitId);
    add(
      line.id,
      "poUnitPrice",
      poLine.unitPrice.toString(),
      line.unitPrice.toString(),
    );
    add(line.id, "gstRate", po.gstRate.toString(), line.gstRate.toString());
    add(line.id, "discountBeforeTax", "0", line.discountBeforeTax.toString());
    add(line.id, "discountAfterTax", "0", line.discountAfterTax.toString());

    const priorPoQuantity = await tx.$queryRaw<
      Array<{ quantity: Prisma.Decimal }>
    >`
      SELECT COALESCE(SUM(il.quantity), 0)::numeric AS quantity
      FROM "SupplierInvoiceLine" il
      JOIN "SupplierInvoice" i ON i.id = il."invoiceId"
      WHERE il."purchaseOrderLineId" = ${line.purchaseOrderLineId}::uuid
        AND i.id <> ${invoiceId}::uuid
        AND i.status NOT IN ('DRAFT','CANCELLED','REJECTED')
    `;
    const previouslyInvoiced = D(priorPoQuantity[0]?.quantity ?? 0);
    const remainingOrdered = poLine.quantity.minus(previouslyInvoiced);
    if (line.quantity.gt(remainingOrdered))
      add(
        line.id,
        "eligibleOrderedQuantity",
        remainingOrdered.toString(),
        line.quantity.toString(),
      );

    const allocations = await tx.supplierInvoiceAllocation.findMany({
      where: { invoiceLineId: line.id },
    });
    const currentQuantity = allocations.reduce(
      (sum, allocation) => sum.plus(allocation.quantity),
      D(0),
    );
    add(
      line.id,
      "allocatedQuantity",
      line.quantity.toString(),
      currentQuantity.toString(),
    );
    for (const allocation of allocations) {
      await tx.$queryRaw`SELECT id FROM "GoodsReceiptLine" WHERE id = ${allocation.goodsReceiptLineId}::uuid FOR UPDATE`;
      const grnLine = await tx.goodsReceiptLine.findUniqueOrThrow({
        where: { id: allocation.goodsReceiptLineId },
        include: { goodsReceipt: true },
      });
      const prior = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
        SELECT COALESCE(SUM(a.quantity), 0)::numeric AS quantity
        FROM "SupplierInvoiceAllocation" a
        JOIN "SupplierInvoiceLine" il ON il.id = a."invoiceLineId"
        JOIN "SupplierInvoice" i ON i.id = il."invoiceId"
        WHERE a."goodsReceiptLineId" = ${allocation.goodsReceiptLineId}::uuid
          AND i.id <> ${invoiceId}::uuid
          AND i.status NOT IN ('DRAFT','CANCELLED','REJECTED')
      `;
      const eligible = grnLine.acceptedQuantity.minus(prior[0]?.quantity ?? 0);
      if (allocation.quantity.gt(eligible))
        add(
          line.id,
          "eligibleAcceptedGrnQuantity",
          eligible.toString(),
          allocation.quantity.toString(),
        );
      add(
        line.id,
        "grnPurchaseOrderLine",
        line.purchaseOrderLineId,
        grnLine.purchaseOrderLineId,
      );
      add(line.id, "grnStatus", "POSTED", grnLine.goodsReceipt.status);
    }
    const expectedTaxable = line.quantity
      .mul(poLine.unitPrice)
      .minus(line.discountBeforeTax)
      .plus(line.freightTaxable ? line.freightAmount : 0)
      .toDecimalPlaces(2);
    add(
      line.id,
      "taxableValue",
      expectedTaxable.toString(),
      line.taxableValue.toString(),
    );
  }
  const invoiceFreight = lines.reduce(
    (sum, line) => sum.plus(line.freightAmount),
    D(0),
  );
  const poFreight = purchaseOrders.reduce(
    (sum, po) => sum.plus(po.freightAmount),
    D(0),
  );
  if (invoiceFreight.gt(poFreight))
    add(undefined, "freight", `<=${poFreight}`, invoiceFreight.toString());
  const lineTotal = lines
    .reduce((sum, line) => sum.plus(line.linePayable), D(0))
    .plus(invoice.roundOff);
  add(
    undefined,
    "invoiceTotal",
    lineTotal.toString(),
    invoice.invoiceTotal.toString(),
  );
  return result;
}

export const SupplierInvoiceService = {
  createDraft(principal: AuthenticatedPrincipal, raw: InvoiceDraftInput) {
    const input = invoiceDraftSchema.parse(raw);
    return db.$transaction((tx) => writeDraft(tx, principal, input), {
      maxWait: 10_000,
      timeout: 30_000,
    });
  },

  updateDraft(
    principal: AuthenticatedPrincipal,
    invoiceId: string,
    raw: InvoiceDraftInput,
  ) {
    const input = invoiceDraftSchema.parse(raw);
    return db.$transaction(
      (tx) => writeDraft(tx, principal, input, invoiceId),
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  },

  command(principal: AuthenticatedPrincipal, raw: InvoiceCommandInput) {
    const input = invoiceCommandSchema.parse(raw);
    return db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SupplierInvoice" WHERE id = ${input.invoiceId}::uuid FOR UPDATE`;
        const invoice = await tx.supplierInvoice.findUniqueOrThrow({
          where: { id: input.invoiceId },
        });
        if (["APPROVE", "REJECT"].includes(input.command))
          await requireFinanceRole(tx, principal, ["MANAGING_DIRECTOR"]);
        else await requireFinanceRole(tx, principal, accountRoles);

        if (input.command === "ACCEPT_MISMATCH") {
          const reason = requireReason(input.reason, input.command);
          assert(
            invoice.status === "DISPUTED",
            "Only disputed invoices have reviewable mismatches.",
          );
          assert(input.mismatchId, "Select a mismatch.");
          const mismatch = await tx.invoiceMismatch.findFirst({
            where: {
              id: input.mismatchId,
              invoiceId: invoice.id,
              status: "OPEN",
            },
          });
          assert(mismatch, "The mismatch is no longer open.");
          await tx.invoiceMismatch.update({
            where: { id: mismatch.id },
            data: {
              status: "ACCEPTED",
              reviewReason: reason,
              reviewedById: principal.userId,
              reviewedAt: new Date(),
            },
          });
          if (mismatch.invoiceLineId)
            await tx.supplierInvoiceLine.update({
              where: { id: mismatch.invoiceLineId },
              data: {
                matchStatus: "ACCEPTED",
                mismatchAcceptedById: principal.userId,
                mismatchAcceptanceReason: reason,
              },
            });
          await AuditService.record(
            {
              actorUserId: principal.userId,
              action: "APPROVE",
              entityType: "InvoiceMismatch",
              entityId: mismatch.id,
              before: { status: "OPEN" },
              after: { status: "ACCEPTED" },
              reason,
            },
            tx,
          );
          return { id: invoice.id, status: invoice.status };
        }

        let next: InvoiceState;
        let reason = input.reason?.trim();
        switch (input.command) {
          case "SUBMIT":
            next = "UNDER_REVIEW";
            assert(
              invoice.documentId,
              "Attach a clean supplier invoice document before submission.",
            );
            break;
          case "RUN_MATCH": {
            assert(
              invoice.status === "UNDER_REVIEW",
              "Invoice must be under review.",
            );
            const mismatches = await lineMismatches(tx, invoice.id);
            const accepted = await tx.invoiceMismatch.findMany({
              where: { invoiceId: invoice.id, status: "ACCEPTED" },
            });
            const unresolved = mismatches.filter(
              (mismatch) =>
                !accepted.some(
                  (item) =>
                    item.invoiceLineId === (mismatch.invoiceLineId ?? null) &&
                    item.field === mismatch.field &&
                    item.expectedValue === mismatch.expectedValue &&
                    item.actualValue === mismatch.actualValue,
                ),
            );
            if (unresolved.length) {
              await tx.invoiceMismatch.createMany({
                data: unresolved.map((mismatch) => ({
                  ...mismatch,
                  invoiceId: invoice.id,
                })),
              });
              for (const lineId of new Set(
                unresolved.map((item) => item.invoiceLineId).filter(Boolean),
              ))
                await tx.supplierInvoiceLine.update({
                  where: { id: lineId! },
                  data: { matchStatus: "MISMATCH" },
                });
              next = "DISPUTED";
              reason =
                reason || "Three-way match found unresolved differences.";
              await notification(
                tx,
                "INVOICE_MISMATCH",
                invoice.id,
                "ACCOUNTS",
                {
                  invoiceNumber: invoice.internalNumber,
                  mismatches: unresolved.length,
                },
              );
            } else {
              await tx.supplierInvoiceLine.updateMany({
                where: {
                  invoiceId: invoice.id,
                  matchStatus: { not: "ACCEPTED" },
                },
                data: { matchStatus: "MATCHED" },
              });
              next = "MATCHED";
            }
            break;
          }
          case "RESUBMIT":
            assert(
              (await tx.invoiceMismatch.count({
                where: { invoiceId: invoice.id, status: "OPEN" },
              })) === 0,
              "Review every mismatch before resubmitting.",
            );
            next = "UNDER_REVIEW";
            reason = requireReason(reason, input.command);
            break;
          case "VERIFY":
            next = "VERIFIED";
            break;
          case "REQUEST_APPROVAL":
            next = "MD_APPROVAL_PENDING";
            break;
          case "APPROVE":
            next = "APPROVED";
            assert(
              invoice.createdById !== principal.userId &&
                invoice.verifiedById !== principal.userId,
              "The invoice creator or verifier cannot perform MD approval.",
            );
            reason = requireReason(reason, input.command);
            break;
          case "REJECT":
            next = "REJECTED";
            reason = requireReason(reason, input.command);
            break;
          case "CANCEL":
            next = "CANCELLED";
            reason = requireReason(reason, input.command);
            break;
          case "PAYMENT_HOLD":
            next = "PAYMENT_HOLD";
            reason = requireReason(reason, input.command);
            break;
          case "RELEASE_HOLD":
            next = invoice.paidAmount.gt(0) ? "PARTIALLY_PAID" : "APPROVED";
            reason = requireReason(reason, input.command);
            break;
          default:
            throw new AppError(
              "VALIDATION_ERROR",
              "Unsupported invoice command.",
            );
        }
        assertInvoiceTransition(invoice.status as InvoiceState, next);
        const now = new Date();
        const updated = await tx.supplierInvoice.update({
          where: { id: invoice.id },
          data: {
            status: next,
            reviewedById:
              input.command === "RUN_MATCH" ? principal.userId : undefined,
            verifiedById:
              input.command === "VERIFY" ? principal.userId : undefined,
            approvedById:
              input.command === "APPROVE" ? principal.userId : undefined,
            rejectedById:
              input.command === "REJECT" ? principal.userId : undefined,
            approvedPayable:
              input.command === "APPROVE" ? invoice.invoiceTotal : undefined,
            finalizedAt: input.command === "APPROVE" ? now : undefined,
          },
        });
        await workflow(
          tx,
          principal,
          invoice.id,
          input.command,
          invoice.status,
          next,
          reason,
        );
        if (input.command === "REQUEST_APPROVAL")
          await notification(
            tx,
            "INVOICE_AWAITING_MD_APPROVAL",
            invoice.id,
            "MANAGING_DIRECTOR",
            {
              invoiceNumber: invoice.internalNumber,
              amount: invoice.invoiceTotal.toString(),
            },
          );
        if (input.command === "SUBMIT")
          await notification(
            tx,
            "INVOICE_ASSIGNED_FOR_VERIFICATION",
            invoice.id,
            "ACCOUNTS",
            { invoiceNumber: invoice.internalNumber },
          );
        if (input.command === "APPROVE") {
          await tx.financialBalanceEvent.create({
            data: {
              supplierId: invoice.supplierId,
              invoiceId: invoice.id,
              entityType: "SUPPLIER_INVOICE",
              entityId: invoice.id,
              direction: "IN",
              amount: invoice.invoiceTotal,
              reason: reason!,
              createdById: principal.userId,
            },
          });
          const lines = await tx.supplierInvoiceLine.findMany({
            where: { invoiceId: invoice.id },
          });
          const poLines = await tx.purchaseOrderLine.findMany({
            where: {
              id: { in: lines.map((line) => line.purchaseOrderLineId) },
            },
            include: {
              requirementLine: {
                select: {
                  requirement: {
                    select: {
                      projectId: true,
                      site: { select: { siteCode: true, name: true } },
                    },
                  },
                },
              },
            },
          });
          const projectByLine = new Map(
            poLines.map((line) => [
              line.id,
              {
                projectId: line.requirementLine.requirement.projectId,
                workPackage: `${line.requirementLine.requirement.site.siteCode} · ${line.requirementLine.requirement.site.name}`,
              },
            ]),
          );
          await tx.projectCostAllocation.createMany({
            data: lines.map((line) => {
              const allocation = projectByLine.get(line.purchaseOrderLineId)!;
              return {
                invoiceLineId: line.id,
                projectId: allocation.projectId,
                workPackage: allocation.workPackage,
                amount: line.linePayable,
              };
            }),
            skipDuplicates: true,
          });
          const supplier = await tx.supplier.findUniqueOrThrow({
            where: { id: invoice.supplierId },
          });
          await queueTallyExport(tx, principal, {
            entityType: "SUPPLIER_INVOICE",
            entityId: invoice.id,
            number: invoice.internalNumber,
            date: invoice.invoiceDate,
            supplier: supplier.legalName,
            amount: invoice.invoiceTotal.toString(),
            gst: invoice.cgstAmount
              .plus(invoice.sgstAmount)
              .plus(invoice.igstAmount)
              .toString(),
            tds: invoice.tdsAmount.toString(),
            rcm: lines.some((line) => line.reverseCharge),
            project: Array.from(
              new Set(
                lines.map(
                  (line) =>
                    projectByLine.get(line.purchaseOrderLineId)?.workPackage,
                ),
              ),
            )
              .filter((value): value is string => !!value)
              .join(", "),
            reference: invoice.supplierInvoiceNumber,
          });
        }
        return { id: updated.id, status: updated.status };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  },
};
