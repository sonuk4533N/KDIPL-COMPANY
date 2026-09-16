import "server-only";

import { db } from "@/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AuditService } from "@/server/audit/audit-service";
import { indianFinancialYear } from "@/server/finance/domain";
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
  advanceSchema,
  financialNoteSchema,
  type AdvanceInput,
  type FinancialNoteInput,
} from "./finance-schemas";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError("VALIDATION_ERROR", message);
}

async function cleanDocument(
  tx: Prisma.TransactionClient,
  id: string,
  allowedTypes: readonly string[],
) {
  const file = await tx.fileRecord.findFirst({
    where: {
      id,
      documentType: { in: [...allowedTypes] },
      scanStatus: "CLEAN",
      retentionUntil: { gt: new Date() },
    },
    select: { id: true },
  });
  assert(file, "Use a clean retained financial document.");
}

export const SupplierAdvanceService = {
  create(principal: AuthenticatedPrincipal, raw: AdvanceInput) {
    const input = advanceSchema.parse(raw);
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, accountRoles);
      await cleanDocument(tx, input.evidenceDocumentId, [
        "ADVANCE_PAYMENT_EVIDENCE",
      ]);
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${input.purchaseOrderId}::uuid FOR UPDATE`;
      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: input.purchaseOrderId },
      });
      assert(
        ["ISSUED", "ACCEPTED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(
          po.status,
        ),
        "Advance requires an issued or accepted purchase order.",
      );
      assert(
        po.permitsAdvance && po.maximumAdvancePercent,
        "The purchase order does not permit an advance.",
      );
      const percent = new Prisma.Decimal(input.advancePercent);
      const amount = new Prisma.Decimal(input.amount);
      assert(
        percent.lte(po.maximumAdvancePercent),
        "Advance percentage exceeds PO terms.",
      );
      assert(
        amount.lte(po.totalAmount.mul(percent).div(100)),
        "Advance amount exceeds PO terms.",
      );
      const advance = await tx.supplierAdvance.create({
        data: {
          advanceNumber: await nextFinanceNumber(tx, "ADVANCE"),
          purchaseOrderId: po.id,
          supplierId: po.supplierId,
          advancePercent: percent,
          approvedAmount: amount,
          method: input.method,
          referenceNumber: input.referenceNumber,
          evidenceDocumentId: input.evidenceDocumentId,
          reason: input.reason,
          preparedById: principal.userId,
        },
      });
      await tx.notificationOutbox.create({
        data: {
          eventType: "ADVANCE_AWAITING_MD_APPROVAL",
          entityType: "SUPPLIER_ADVANCE",
          entityId: advance.id,
          recipientRole: "MANAGING_DIRECTOR",
          channels: ["IN_APP", "WHATSAPP"],
          payload: { number: advance.advanceNumber, amount: amount.toString() },
          remindAt: new Date(Date.now() + 24 * 60 * 60_000),
          escalateAt: new Date(Date.now() + 48 * 60 * 60_000),
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: "SUBMIT",
          entityType: "SupplierAdvance",
          entityId: advance.id,
          after: { number: advance.advanceNumber, amount },
          reason: input.reason,
        },
        tx,
      );
      return { id: advance.id, number: advance.advanceNumber };
    });
  },

  decide(
    principal: AuthenticatedPrincipal,
    advanceId: string,
    decision: "APPROVE" | "REJECT",
    rawReason: string,
  ) {
    const reason = requireReason(rawReason, decision);
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, ["MANAGING_DIRECTOR"]);
      await tx.$queryRaw`SELECT id FROM "SupplierAdvance" WHERE id = ${advanceId}::uuid FOR UPDATE`;
      const advance = await tx.supplierAdvance.findUniqueOrThrow({
        where: { id: advanceId },
      });
      assert(
        advance.status === "PENDING_APPROVAL",
        "Advance is not awaiting approval.",
      );
      assert(
        advance.preparedById !== principal.userId,
        "Advance preparation and approval require different actors.",
      );
      const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      await tx.supplierAdvance.update({
        where: { id: advance.id },
        data: {
          status,
          approvedById: decision === "APPROVE" ? principal.userId : undefined,
          finalizedAt: decision === "APPROVE" ? new Date() : undefined,
        },
      });
      if (decision === "APPROVE") {
        await tx.financialBalanceEvent.create({
          data: {
            supplierId: advance.supplierId,
            entityType: "SUPPLIER_ADVANCE",
            entityId: advance.id,
            direction: "OUT",
            amount: advance.approvedAmount,
            reason,
            createdById: principal.userId,
          },
        });
        const supplier = await tx.supplier.findUniqueOrThrow({
          where: { id: advance.supplierId },
        });
        await queueTallyExport(tx, principal, {
          entityType: "SUPPLIER_ADVANCE",
          entityId: advance.id,
          number: advance.advanceNumber,
          date: new Date(),
          supplier: supplier.legalName,
          amount: advance.approvedAmount.negated().toString(),
          reference: advance.referenceNumber ?? undefined,
        });
      }
      await tx.financeWorkflowEvent.create({
        data: {
          entityType: "SUPPLIER_ADVANCE",
          entityId: advance.id,
          action: decision,
          fromStatus: advance.status,
          toStatus: status,
          actorUserId: principal.userId,
          reason,
        },
      });
      return { id: advance.id, status };
    });
  },

  apply(
    principal: AuthenticatedPrincipal,
    advanceId: string,
    invoiceId: string,
    rawAmount: string,
    rawReason: string,
  ) {
    const reason = requireReason(rawReason, "APPLY_ADVANCE");
    const amount = new Prisma.Decimal(rawAmount);
    assert(amount.gt(0), "Application amount must be positive.");
    return db.$transaction(
      async (tx) => {
        await requireFinanceRole(tx, principal, accountRoles);
        await tx.$queryRaw`SELECT id FROM "SupplierAdvance" WHERE id = ${advanceId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "SupplierInvoice" WHERE id = ${invoiceId}::uuid FOR UPDATE`;
        const [advance, invoice] = await Promise.all([
          tx.supplierAdvance.findUniqueOrThrow({ where: { id: advanceId } }),
          tx.supplierInvoice.findUniqueOrThrow({ where: { id: invoiceId } }),
        ]);
        assert(
          ["APPROVED", "PARTIALLY_APPLIED"].includes(advance.status),
          "Advance is not available.",
        );
        assert(
          advance.supplierId === invoice.supplierId,
          "Advance and invoice suppliers differ.",
        );
        const remainingAdvance = advance.approvedAmount
          .minus(advance.appliedAmount)
          .minus(advance.refundedAmount);
        const invoiceBalance = (invoice.approvedPayable ?? invoice.invoiceTotal)
          .plus(invoice.debitApplied)
          .minus(invoice.paidAmount)
          .minus(invoice.creditApplied)
          .minus(invoice.advanceApplied);
        assert(
          amount.lte(remainingAdvance) && amount.lte(invoiceBalance),
          "Advance application exceeds an available balance.",
        );
        await tx.supplierAdvanceApplication.create({
          data: { advanceId, invoiceId, amount, appliedById: principal.userId },
        });
        const appliedAmount = advance.appliedAmount.plus(amount);
        const advanceStatus = appliedAmount.eq(
          advance.approvedAmount.minus(advance.refundedAmount),
        )
          ? "APPLIED"
          : "PARTIALLY_APPLIED";
        await tx.supplierAdvance.update({
          where: { id: advance.id },
          data: { appliedAmount, status: advanceStatus },
        });
        await tx.supplierInvoice.update({
          where: { id: invoice.id },
          data: { advanceApplied: invoice.advanceApplied.plus(amount) },
        });
        await AuditService.record(
          {
            actorUserId: principal.userId,
            action: "ADJUST",
            entityType: "SupplierAdvanceApplication",
            entityId: advance.id,
            after: { invoiceId, amount },
            reason,
          },
          tx,
        );
        return { id: advance.id, status: advanceStatus };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  },

  settle(
    principal: AuthenticatedPrincipal,
    advanceId: string,
    action: "REFUND" | "REVERSE",
    evidenceDocumentId: string,
    rawReason: string,
  ) {
    const reason = requireReason(rawReason, action);
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, accountRoles);
      await cleanDocument(tx, evidenceDocumentId, ["PAYMENT_PROOF"]);
      await tx.$queryRaw`SELECT id FROM "SupplierAdvance" WHERE id = ${advanceId}::uuid FOR UPDATE`;
      const advance = await tx.supplierAdvance.findUniqueOrThrow({
        where: { id: advanceId },
      });
      assert(
        ["APPROVED", "PARTIALLY_APPLIED"].includes(advance.status),
        "Only an available approved advance can be settled.",
      );
      if (action === "REVERSE")
        assert(
          advance.appliedAmount.eq(0),
          "An applied advance must be refunded, not reversed.",
        );
      const remaining = advance.approvedAmount
        .minus(advance.appliedAmount)
        .minus(advance.refundedAmount);
      assert(remaining.gt(0), "The advance has no unapplied balance.");
      const status = action === "REFUND" ? "REFUNDED" : "REVERSED";
      await tx.supplierAdvance.update({
        where: { id: advance.id },
        data: {
          refundedAmount: advance.refundedAmount.plus(remaining),
          status,
        },
      });
      await tx.financialBalanceEvent.create({
        data: {
          supplierId: advance.supplierId,
          entityType: `SUPPLIER_ADVANCE_${action}`,
          entityId: advance.id,
          direction: "IN",
          amount: remaining,
          reason,
          createdById: principal.userId,
        },
      });
      const supplier = await tx.supplier.findUniqueOrThrow({
        where: { id: advance.supplierId },
      });
      await queueTallyExport(tx, principal, {
        entityType: `SUPPLIER_ADVANCE_${action}`,
        entityId: advance.id,
        number: advance.advanceNumber,
        date: new Date(),
        supplier: supplier.legalName,
        amount: remaining.toString(),
        reference: evidenceDocumentId,
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: "ADJUST",
          entityType: "SupplierAdvance",
          entityId: advance.id,
          before: {
            status: advance.status,
            refundedAmount: advance.refundedAmount,
          },
          after: {
            status,
            refundedAmount: advance.refundedAmount.plus(remaining),
          },
          reason,
        },
        tx,
      );
      return { id: advance.id, status };
    });
  },
};

export const SupplierFinancialNoteService = {
  create(principal: AuthenticatedPrincipal, raw: FinancialNoteInput) {
    const input = financialNoteSchema.parse(raw);
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, accountRoles);
      await cleanDocument(tx, input.documentId, ["CREDIT_NOTE", "DEBIT_NOTE"]);
      const invoice = await tx.supplierInvoice.findUniqueOrThrow({
        where: { id: input.invoiceId },
      });
      assert(
        ["APPROVED", "PARTIALLY_PAID", "PAID", "PAYMENT_HOLD"].includes(
          invoice.status,
        ),
        "Notes require a finalized invoice.",
      );
      if (input.goodsReceiptId) {
        const link = await tx.supplierInvoiceGoodsReceipt.findUnique({
          where: {
            invoiceId_goodsReceiptId: {
              invoiceId: invoice.id,
              goodsReceiptId: input.goodsReceiptId,
            },
          },
        });
        assert(link, "The GRN is not linked to the original invoice.");
      }
      const date = new Date();
      const invoiceLines = await tx.supplierInvoiceLine.findMany({
        where: {
          id: { in: input.lines.map((line) => line.invoiceLineId) },
          invoiceId: invoice.id,
        },
      });
      assert(
        invoiceLines.length ===
          new Set(input.lines.map((line) => line.invoiceLineId)).size,
        "Every note line must reference an item on the original invoice.",
      );
      const rules = await tx.taxRuleVersion.findMany({
        where: {
          id: { in: input.lines.map((line) => line.taxRuleVersionId) },
          kind: "GST",
        },
      });
      const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
      const calculatedLines = input.lines.map((line) => {
        const rule = ruleById.get(line.taxRuleVersionId);
        assert(rule, "Select a valid GST rule for each note line.");
        assert(
          rule.effectiveFrom <= date &&
            (!rule.effectiveTo || rule.effectiveTo >= date),
          "The selected GST rule is not currently effective.",
        );
        const taxableValue = new Prisma.Decimal(
          line.taxableValue,
        ).toDecimalPlaces(2);
        const taxAmount = taxableValue
          .mul(rule.rate)
          .div(100)
          .toDecimalPlaces(2);
        return {
          ...line,
          taxableValue,
          gstRate: rule.rate,
          taxAmount,
          totalAmount: taxableValue.plus(taxAmount),
        };
      });
      const taxableValue = calculatedLines.reduce(
        (sum, line) => sum.plus(line.taxableValue),
        new Prisma.Decimal(0),
      );
      const taxAmount = calculatedLines.reduce(
        (sum, line) => sum.plus(line.taxAmount),
        new Prisma.Decimal(0),
      );
      const totalAmount = taxableValue.plus(taxAmount);
      const note = await tx.supplierFinancialNote.create({
        data: {
          noteNumber: await nextFinanceNumber(
            tx,
            input.noteType === "CREDIT" ? "CREDIT_NOTE" : "DEBIT_NOTE",
            date,
          ),
          noteType: input.noteType,
          invoiceId: invoice.id,
          goodsReceiptId: input.goodsReceiptId,
          supplierId: invoice.supplierId,
          financialYear: indianFinancialYear(date).code,
          reasonCode: input.reasonCode,
          reason: input.reason,
          taxableValue,
          taxAmount,
          totalAmount,
          documentId: input.documentId,
          createdById: principal.userId,
        },
      });
      await tx.supplierFinancialNoteLine.createMany({
        data: calculatedLines.map((line) => ({
          noteId: note.id,
          invoiceLineId: line.invoiceLineId,
          hsnSac: line.hsnSac,
          quantity: line.quantity,
          taxableValue: line.taxableValue,
          taxRuleVersionId: line.taxRuleVersionId,
          gstRate: line.gstRate,
          taxAmount: line.taxAmount,
          totalAmount: line.totalAmount,
        })),
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: "CREATE",
          entityType: "SupplierFinancialNote",
          entityId: note.id,
          after: {
            noteNumber: note.noteNumber,
            noteType: note.noteType,
            totalAmount: note.totalAmount,
          },
          reason: note.reason,
        },
        tx,
      );
      return { id: note.id, number: note.noteNumber };
    });
  },

  submit(principal: AuthenticatedPrincipal, noteId: string, reason: string) {
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, accountRoles);
      const note = await tx.supplierFinancialNote.findUniqueOrThrow({
        where: { id: noteId },
      });
      assert(note.status === "DRAFT", "Only draft notes may be submitted.");
      await tx.supplierFinancialNote.update({
        where: { id: note.id },
        data: { status: "PENDING_APPROVAL" },
      });
      await tx.financeWorkflowEvent.create({
        data: {
          entityType: "SUPPLIER_NOTE",
          entityId: note.id,
          action: "SUBMIT",
          fromStatus: note.status,
          toStatus: "PENDING_APPROVAL",
          actorUserId: principal.userId,
          reason: requireReason(reason, "SUBMIT"),
        },
      });
      return { id: note.id, status: "PENDING_APPROVAL" };
    });
  },

  decide(
    principal: AuthenticatedPrincipal,
    noteId: string,
    decision: "APPROVE" | "REJECT",
    rawReason: string,
  ) {
    const reason = requireReason(rawReason, decision);
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, ["MANAGING_DIRECTOR"]);
      await tx.$queryRaw`SELECT id FROM "SupplierFinancialNote" WHERE id = ${noteId}::uuid FOR UPDATE`;
      const note = await tx.supplierFinancialNote.findUniqueOrThrow({
        where: { id: noteId },
      });
      assert(
        note.status === "PENDING_APPROVAL",
        "Note is not awaiting approval.",
      );
      assert(
        note.createdById !== principal.userId,
        "Note creation and approval require different actors.",
      );
      const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      await tx.supplierFinancialNote.update({
        where: { id: note.id },
        data: {
          status,
          approvedById: decision === "APPROVE" ? principal.userId : undefined,
          finalizedAt: decision === "APPROVE" ? new Date() : undefined,
        },
      });
      if (decision === "APPROVE") {
        const invoice = await tx.supplierInvoice.findUniqueOrThrow({
          where: { id: note.invoiceId },
        });
        const supplier = await tx.supplier.findUniqueOrThrow({
          where: { id: note.supplierId },
        });
        const invoiceBalance = (invoice.approvedPayable ?? invoice.invoiceTotal)
          .plus(invoice.debitApplied)
          .minus(invoice.paidAmount)
          .minus(invoice.creditApplied)
          .minus(invoice.advanceApplied);
        const appliedAmount =
          note.noteType === "CREDIT"
            ? invoiceBalance.lte(0)
              ? new Prisma.Decimal(0)
              : note.totalAmount.lte(invoiceBalance)
                ? note.totalAmount
                : invoiceBalance
            : note.totalAmount;
        await tx.financialBalanceEvent.create({
          data: {
            supplierId: note.supplierId,
            invoiceId: note.invoiceId,
            entityType: `SUPPLIER_${note.noteType}_NOTE`,
            entityId: note.id,
            direction: note.noteType === "CREDIT" ? "OUT" : "IN",
            amount: note.totalAmount,
            reason,
            createdById: principal.userId,
          },
        });
        await tx.supplierFinancialNote.update({
          where: { id: note.id },
          data: { appliedAmount },
        });
        const creditApplied =
          note.noteType === "CREDIT"
            ? invoice.creditApplied.plus(appliedAmount)
            : invoice.creditApplied;
        const debitApplied =
          note.noteType === "DEBIT"
            ? invoice.debitApplied.plus(appliedAmount)
            : invoice.debitApplied;
        const remaining = (invoice.approvedPayable ?? invoice.invoiceTotal)
          .plus(debitApplied)
          .minus(invoice.paidAmount)
          .minus(creditApplied)
          .minus(invoice.advanceApplied);
        await tx.supplierInvoice.update({
          where: { id: invoice.id },
          data: {
            creditApplied,
            debitApplied,
            status: remaining.eq(0)
              ? "PAID"
              : invoice.paidAmount.gt(0)
                ? "PARTIALLY_PAID"
                : "APPROVED",
          },
        });
        await queueTallyExport(tx, principal, {
          entityType: `SUPPLIER_${note.noteType}_NOTE`,
          entityId: note.id,
          number: note.noteNumber,
          date: new Date(),
          supplier: supplier.legalName,
          amount:
            note.noteType === "CREDIT"
              ? note.totalAmount.negated().toString()
              : note.totalAmount.toString(),
          gst: note.taxAmount.toString(),
          reference: invoice.internalNumber,
        });
      }
      await tx.financeWorkflowEvent.create({
        data: {
          entityType: "SUPPLIER_NOTE",
          entityId: note.id,
          action: decision,
          fromStatus: note.status,
          toStatus: status,
          actorUserId: principal.userId,
          reason,
        },
      });
      return { id: note.id, status };
    });
  },

  resolveReceiptException(
    principal: AuthenticatedPrincipal,
    exceptionId: string,
    resolutionType: "REPLACEMENT" | "CREDIT_NOTE" | "DEBIT_NOTE",
    resolutionId: string,
    rawReason: string,
  ) {
    const reason = requireReason(rawReason, "FINANCIAL_EXCEPTION_RESOLUTION");
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, accountRoles);
      await tx.$queryRaw`SELECT id FROM "GoodsReceiptException" WHERE id = ${exceptionId}::uuid FOR UPDATE`;
      const exception = await tx.goodsReceiptException.findUniqueOrThrow({
        where: { id: exceptionId },
      });
      if (resolutionType === "REPLACEMENT") {
        const receipt = await tx.goodsReceipt.findFirst({
          where: { id: resolutionId, status: "POSTED" },
        });
        assert(receipt, "Replacement receipt must be posted.");
      } else {
        const note = await tx.supplierFinancialNote.findFirst({
          where: {
            id: resolutionId,
            noteType: resolutionType === "CREDIT_NOTE" ? "CREDIT" : "DEBIT",
            status: "APPROVED",
          },
        });
        assert(note, "Financial note must be approved.");
      }
      await tx.goodsReceiptException.update({
        where: { id: exception.id },
        data: {
          status: "RESOLVED",
          financialResolutionType: resolutionType,
          financialResolutionId: resolutionId,
          financiallyResolvedAt: new Date(),
          resolutionNotes: reason,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: "UPDATE",
          entityType: "GoodsReceiptExceptionFinancialResolution",
          entityId: exception.id,
          before: { status: exception.status },
          after: { status: "RESOLVED", resolutionType, resolutionId },
          reason,
        },
        tx,
      );
      return { id: exception.id, status: "RESOLVED" };
    });
  },
};
