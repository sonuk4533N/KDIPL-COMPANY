import "server-only";

import { db } from "@/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AuditService } from "@/server/audit/audit-service";
import { nextFinanceNumber } from "@/server/finance/numbering";
import {
  accountRoles,
  requireFinanceRole,
  requireReason,
} from "@/server/finance/policy";
import { queueTallyExport } from "@/server/finance/tally-export";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";
import { paymentSchema, type PaymentInput } from "./finance-schemas";

type Tx = Prisma.TransactionClient;
const allowedInvoiceStates = ["APPROVED", "PARTIALLY_PAID"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError("VALIDATION_ERROR", message);
}

async function cleanProof(tx: Tx, id: string) {
  const file = await tx.fileRecord.findFirst({
    where: {
      id,
      documentType: "PAYMENT_PROOF",
      scanStatus: "CLEAN",
      retentionUntil: { gt: new Date() },
    },
    select: { id: true },
  });
  assert(file, "Every payment requires clean retained proof.");
}

function validateMethod(input: PaymentInput) {
  if (["NEFT", "RTGS", "IMPS"].includes(input.method)) {
    assert(
      input.bankAccountId,
      "Bank payments require a company bank account.",
    );
    assert(
      input.referenceNumber,
      "Bank payments require a UTR/reference number.",
    );
  }
  if (input.method === "CHEQUE") {
    assert(
      input.bankAccountId,
      "Cheque payments require a company bank account.",
    );
    assert(
      input.chequeNumber && input.chequeDate,
      "Cheque number and date are required.",
    );
    assert(
      ["PENDING", "CLEARED", "BOUNCED"].includes(input.clearanceStatus ?? ""),
      "Select a valid cheque clearance status.",
    );
  }
  if (["UPI", "COMPANY_CARD", "EMPLOYEE_REIMBURSEMENT"].includes(input.method))
    assert(
      input.referenceNumber,
      `${input.method.replaceAll("_", " ")} requires a reference.`,
    );
}

async function notify(
  tx: Tx,
  eventType: string,
  entityId: string,
  recipientRole: string,
  payload: Prisma.InputJsonValue,
) {
  const now = Date.now();
  await tx.notificationOutbox.create({
    data: {
      eventType,
      entityType: "SUPPLIER_PAYMENT",
      entityId,
      recipientRole,
      channels: ["IN_APP", "WHATSAPP"],
      payload,
      remindAt: new Date(now + 24 * 60 * 60_000),
      escalateAt: new Date(now + 48 * 60 * 60_000),
    },
  });
}

export const SupplierPaymentService = {
  prepare(principal: AuthenticatedPrincipal, raw: PaymentInput) {
    const input = paymentSchema.parse(raw);
    validateMethod(input);
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, accountRoles);
      await cleanProof(tx, input.proofDocumentId);
      const invoice = await tx.supplierInvoice.findUniqueOrThrow({
        where: { id: input.invoiceId },
      });
      assert(
        allowedInvoiceStates.includes(invoice.status),
        "Only approved invoices can be paid.",
      );
      const balance = (invoice.approvedPayable ?? invoice.invoiceTotal)
        .plus(invoice.debitApplied)
        .minus(invoice.paidAmount)
        .minus(invoice.creditApplied)
        .minus(invoice.advanceApplied);
      assert(
        new Prisma.Decimal(input.amount).lte(balance),
        "Payment exceeds the current invoice balance.",
      );
      const payment = await tx.supplierPayment.create({
        data: {
          paymentNumber: await nextFinanceNumber(
            tx,
            "PAYMENT",
            new Date(`${input.paymentDate}T00:00:00.000Z`),
          ),
          invoiceId: invoice.id,
          supplierId: invoice.supplierId,
          status: "PENDING_APPROVAL",
          method: input.method,
          amount: input.amount,
          paymentDate: new Date(`${input.paymentDate}T00:00:00.000Z`),
          bankAccountId: input.bankAccountId,
          referenceNumber: input.referenceNumber,
          chequeNumber: input.chequeNumber,
          chequeDate: input.chequeDate
            ? new Date(`${input.chequeDate}T00:00:00.000Z`)
            : undefined,
          clearanceStatus: input.clearanceStatus,
          proofDocumentId: input.proofDocumentId,
          preparedById: principal.userId,
          reason: input.reason,
        },
      });
      await tx.financeWorkflowEvent.create({
        data: {
          entityType: "SUPPLIER_PAYMENT",
          entityId: payment.id,
          action: "SUBMIT",
          fromStatus: "PREPARED",
          toStatus: "PENDING_APPROVAL",
          actorUserId: principal.userId,
          reason: input.reason,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: "SUBMIT",
          entityType: "SupplierPayment",
          entityId: payment.id,
          after: {
            paymentNumber: payment.paymentNumber,
            amount: payment.amount,
          },
          reason: input.reason,
        },
        tx,
      );
      await notify(
        tx,
        "PAYMENT_AWAITING_MD_APPROVAL",
        payment.id,
        "MANAGING_DIRECTOR",
        {
          paymentNumber: payment.paymentNumber,
          amount: payment.amount.toString(),
        },
      );
      return { id: payment.id, number: payment.paymentNumber };
    });
  },

  prepareReversal(
    principal: AuthenticatedPrincipal,
    originalPaymentId: string,
    proofDocumentId: string,
    rawReason: string,
  ) {
    const reason = requireReason(rawReason, "REVERSE");
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, accountRoles);
      await cleanProof(tx, proofDocumentId);
      await tx.$queryRaw`SELECT id FROM "SupplierPayment" WHERE id = ${originalPaymentId}::uuid FOR UPDATE`;
      const original = await tx.supplierPayment.findUniqueOrThrow({
        where: { id: originalPaymentId },
      });
      assert(
        original.status === "APPROVED",
        "Only an approved payment can be reversed.",
      );
      assert(
        !original.reversalOfId,
        "A reversal payment cannot itself be reversed.",
      );
      const existing = await tx.supplierPayment.findUnique({
        where: { reversalOfId: original.id },
      });
      assert(!existing, "This payment already has a reversal workflow.");
      const paymentDate = new Date();
      const reversal = await tx.supplierPayment.create({
        data: {
          paymentNumber: await nextFinanceNumber(tx, "PAYMENT", paymentDate),
          invoiceId: original.invoiceId,
          supplierId: original.supplierId,
          status: "PENDING_APPROVAL",
          method: original.method,
          amount: original.amount,
          paymentDate,
          bankAccountId: original.bankAccountId,
          referenceNumber: `REV-${original.paymentNumber}`,
          clearanceStatus: original.clearanceStatus,
          proofDocumentId,
          preparedById: principal.userId,
          reversalOfId: original.id,
          reason,
        },
      });
      await tx.financeWorkflowEvent.create({
        data: {
          entityType: "SUPPLIER_PAYMENT",
          entityId: reversal.id,
          action: "REVERSE_REQUEST",
          fromStatus: "PREPARED",
          toStatus: "PENDING_APPROVAL",
          actorUserId: principal.userId,
          reason,
        },
      });
      await notify(
        tx,
        "PAYMENT_REVERSAL_AWAITING_MD_APPROVAL",
        reversal.id,
        "MANAGING_DIRECTOR",
        {
          paymentNumber: reversal.paymentNumber,
          originalPaymentNumber: original.paymentNumber,
          amount: reversal.amount.toString(),
        },
      );
      return {
        id: reversal.id,
        number: reversal.paymentNumber,
        status: reversal.status,
      };
    });
  },

  updateChequeClearance(
    principal: AuthenticatedPrincipal,
    paymentId: string,
    clearanceStatus: "CLEARED" | "BOUNCED",
    rawReason: string,
  ) {
    const reason = requireReason(rawReason, "CHEQUE_CLEARANCE");
    return db.$transaction(async (tx) => {
      await requireFinanceRole(tx, principal, accountRoles);
      await tx.$queryRaw`SELECT id FROM "SupplierPayment" WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.supplierPayment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      assert(
        payment.method === "CHEQUE",
        "Clearance applies only to cheque payments.",
      );
      assert(
        payment.status === "PENDING_APPROVAL",
        "Cheque is no longer awaiting approval.",
      );
      const nextStatus =
        clearanceStatus === "BOUNCED" ? "FAILED" : payment.status;
      await tx.supplierPayment.update({
        where: { id: payment.id },
        data: { clearanceStatus, status: nextStatus },
      });
      await tx.financeWorkflowEvent.create({
        data: {
          entityType: "SUPPLIER_PAYMENT",
          entityId: payment.id,
          action: `CHEQUE_${clearanceStatus}`,
          fromStatus: payment.status,
          toStatus: nextStatus,
          actorUserId: principal.userId,
          reason,
        },
      });
      if (clearanceStatus === "BOUNCED")
        await notify(tx, "PAYMENT_FAILED", payment.id, "ACCOUNTS", {
          paymentNumber: payment.paymentNumber,
          reason,
        });
      return { id: payment.id, status: nextStatus };
    });
  },

  decide(
    principal: AuthenticatedPrincipal,
    paymentId: string,
    decision: "APPROVE" | "REJECT" | "FAIL",
    rawReason: string,
  ) {
    const reason = requireReason(rawReason, decision);
    return db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SupplierPayment" WHERE id = ${paymentId}::uuid FOR UPDATE`;
        const payment = await tx.supplierPayment.findUniqueOrThrow({
          where: { id: paymentId },
        });
        await tx.$queryRaw`SELECT id FROM "SupplierInvoice" WHERE id = ${payment.invoiceId}::uuid FOR UPDATE`;
        const invoice = await tx.supplierInvoice.findUniqueOrThrow({
          where: { id: payment.invoiceId! },
        });
        if (decision === "APPROVE") {
          await requireFinanceRole(tx, principal, ["MANAGING_DIRECTOR"]);
          assert(
            payment.status === "PENDING_APPROVAL",
            "Payment is not awaiting approval.",
          );
          assert(
            payment.preparedById !== principal.userId,
            "Payment preparation and approval require different actors.",
          );
          if (payment.reversalOfId) {
            await tx.$queryRaw`SELECT id FROM "SupplierPayment" WHERE id = ${payment.reversalOfId}::uuid FOR UPDATE`;
            const original = await tx.supplierPayment.findUniqueOrThrow({
              where: { id: payment.reversalOfId },
            });
            assert(
              original.status === "APPROVED",
              "The original payment is no longer reversible.",
            );
            assert(
              payment.amount.lte(invoice.paidAmount),
              "Reversal exceeds the posted paid amount.",
            );
            const paidAmount = invoice.paidAmount.minus(payment.amount);
            const remaining = (invoice.approvedPayable ?? invoice.invoiceTotal)
              .plus(invoice.debitApplied)
              .minus(paidAmount)
              .minus(invoice.creditApplied)
              .minus(invoice.advanceApplied);
            const invoiceStatus = remaining.eq(0)
              ? "PAID"
              : paidAmount.gt(0)
                ? "PARTIALLY_PAID"
                : "APPROVED";
            await tx.supplierPayment.update({
              where: { id: original.id },
              data: { status: "REVERSED" },
            });
            await tx.supplierPayment.update({
              where: { id: payment.id },
              data: {
                status: "APPROVED",
                approvedById: principal.userId,
                finalizedAt: new Date(),
              },
            });
            await tx.supplierInvoice.update({
              where: { id: invoice.id },
              data: { paidAmount, status: invoiceStatus },
            });
            await tx.financialBalanceEvent.create({
              data: {
                supplierId: invoice.supplierId,
                invoiceId: invoice.id,
                entityType: "SUPPLIER_PAYMENT_REVERSAL",
                entityId: payment.id,
                direction: "IN",
                amount: payment.amount,
                reason,
                createdById: principal.userId,
              },
            });
            const supplier = await tx.supplier.findUniqueOrThrow({
              where: { id: invoice.supplierId },
            });
            await queueTallyExport(tx, principal, {
              entityType: "SUPPLIER_PAYMENT_REVERSAL",
              entityId: payment.id,
              number: payment.paymentNumber,
              date: payment.paymentDate,
              supplier: supplier.legalName,
              amount: payment.amount.toString(),
              reference: original.paymentNumber,
            });
            await notify(
              tx,
              "PAYMENT_REVERSAL_COMPLETED",
              payment.id,
              "ACCOUNTS",
              {
                paymentNumber: payment.paymentNumber,
                originalPaymentNumber: original.paymentNumber,
              },
            );
          } else {
            assert(
              allowedInvoiceStates.includes(invoice.status),
              "Invoice is not payable.",
            );
            if (payment.method === "CHEQUE")
              assert(
                payment.clearanceStatus === "CLEARED",
                "Cheque must clear before approval posts the payment.",
              );
            const balance = (invoice.approvedPayable ?? invoice.invoiceTotal)
              .plus(invoice.debitApplied)
              .minus(invoice.paidAmount)
              .minus(invoice.creditApplied)
              .minus(invoice.advanceApplied);
            assert(
              payment.amount.lte(balance),
              "Payment exceeds the locked invoice balance.",
            );
            const paidAmount = invoice.paidAmount.plus(payment.amount);
            const remaining = balance.minus(payment.amount);
            const invoiceStatus = remaining.eq(0) ? "PAID" : "PARTIALLY_PAID";
            await tx.supplierPayment.update({
              where: { id: payment.id },
              data: {
                status: "APPROVED",
                approvedById: principal.userId,
                finalizedAt: new Date(),
              },
            });
            await tx.supplierInvoice.update({
              where: { id: invoice.id },
              data: { paidAmount, status: invoiceStatus },
            });
            await tx.financialBalanceEvent.create({
              data: {
                supplierId: invoice.supplierId,
                invoiceId: invoice.id,
                entityType: "SUPPLIER_PAYMENT",
                entityId: payment.id,
                direction: "OUT",
                amount: payment.amount,
                reason,
                createdById: principal.userId,
              },
            });
            const supplier = await tx.supplier.findUniqueOrThrow({
              where: { id: invoice.supplierId },
            });
            await queueTallyExport(tx, principal, {
              entityType: "SUPPLIER_PAYMENT",
              entityId: payment.id,
              number: payment.paymentNumber,
              date: payment.paymentDate,
              supplier: supplier.legalName,
              amount: payment.amount.negated().toString(),
              reference:
                payment.referenceNumber ??
                payment.chequeNumber ??
                payment.method,
            });
            await notify(tx, "PAYMENT_COMPLETED", payment.id, "ACCOUNTS", {
              paymentNumber: payment.paymentNumber,
              invoiceNumber: invoice.internalNumber,
            });
          }
        } else {
          await requireFinanceRole(
            tx,
            principal,
            decision === "REJECT" ? ["MANAGING_DIRECTOR"] : accountRoles,
          );
          assert(
            payment.status === "PENDING_APPROVAL",
            "Payment is not pending.",
          );
          await tx.supplierPayment.update({
            where: { id: payment.id },
            data: { status: decision === "FAIL" ? "FAILED" : "VOIDED" },
          });
          if (decision === "FAIL")
            await notify(tx, "PAYMENT_FAILED", payment.id, "ACCOUNTS", {
              paymentNumber: payment.paymentNumber,
              reason,
            });
        }
        const toStatus =
          decision === "APPROVE"
            ? "APPROVED"
            : decision === "FAIL"
              ? "FAILED"
              : "VOIDED";
        await tx.financeWorkflowEvent.create({
          data: {
            entityType: "SUPPLIER_PAYMENT",
            entityId: payment.id,
            action: decision,
            fromStatus: payment.status,
            toStatus,
            actorUserId: principal.userId,
            reason,
          },
        });
        await AuditService.record(
          {
            actorUserId: principal.userId,
            action: decision === "APPROVE" ? "APPROVE" : "REJECT",
            entityType: "SupplierPayment",
            entityId: payment.id,
            before: { status: payment.status },
            after: { status: toStatus },
            reason,
          },
          tx,
        );
        return { id: payment.id, status: toStatus };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  },
};
