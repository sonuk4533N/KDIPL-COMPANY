import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import type {
  CreatePurchaseOrderAmendmentInput,
  DecidePurchaseOrderAmendmentInput,
} from "@/features/inventory/purchase-order-amendment-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";

function requirePurchaseManager(principal: AuthenticatedPrincipal) {
  if (
    !principal.roleCodes.includes("PURCHASE_MANAGER") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only the Purchase Manager can propose a PO amendment.",
    );
  }
}

function requireProjectDirector(principal: AuthenticatedPrincipal) {
  if (
    !principal.roleCodes.includes("PROJECT_DIRECTOR") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only the Project Director can decide a PO amendment.",
    );
  }
}

function parseDate(value: string) {
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid delivery date.");
  }
  return result;
}

export const PurchaseOrderAmendmentService = {
  async createAndSubmit(
    principal: AuthenticatedPrincipal,
    input: CreatePurchaseOrderAmendmentInput,
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);

    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "PurchaseOrder"
        WHERE "id" = ${input.purchaseOrderId}::uuid
        FOR UPDATE
      `;
      const purchaseOrder = await transaction.purchaseOrder.findUnique({
        where: { id: input.purchaseOrderId },
        include: { lines: true },
      });
      if (!purchaseOrder) {
        throw new AppError("NOT_FOUND", "Purchase order not found.");
      }
      if (
        purchaseOrder.status !== "ISSUED" &&
        purchaseOrder.status !== "ACCEPTED" &&
        purchaseOrder.status !== "PARTIALLY_RECEIVED"
      ) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only an open issued purchase order can be amended.",
        );
      }
      const pending = await transaction.purchaseOrderAmendment.count({
        where: {
          purchaseOrderId: purchaseOrder.id,
          status: { in: ["DRAFT", "PENDING_APPROVAL"] },
        },
      });
      if (pending) {
        throw new AppError(
          "CONFLICT",
          "Decide or cancel the existing PO amendment first.",
        );
      }
      if (input.lines.length !== purchaseOrder.lines.length) {
        throw new AppError(
          "VALIDATION_ERROR",
          "An amendment must version every PO line.",
        );
      }

      const proposedByLine = new Map(
        input.lines.map((line) => [line.purchaseOrderLineId, line]),
      );
      const postedTotals = await transaction.goodsReceiptLine.groupBy({
        by: ["purchaseOrderLineId"],
        where: {
          purchaseOrderLineId: { in: purchaseOrder.lines.map(({ id }) => id) },
          goodsReceipt: { status: "POSTED" },
        },
        _sum: {
          acceptedQuantity: true,
          damagedQuantity: true,
          rejectedQuantity: true,
        },
      });
      const accountedByLine = new Map(
        postedTotals.map((row) => [
          row.purchaseOrderLineId,
          Number(row._sum.acceptedQuantity ?? 0) +
            Number(row._sum.damagedQuantity ?? 0) +
            Number(row._sum.rejectedQuantity ?? 0),
        ]),
      );
      for (const line of purchaseOrder.lines) {
        const proposed = proposedByLine.get(line.id);
        if (!proposed) {
          throw new AppError("VALIDATION_ERROR", "Invalid PO amendment line.");
        }
        if (proposed.quantity < (accountedByLine.get(line.id) ?? 0)) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Amended quantity cannot be lower than quantities already received.",
          );
        }
      }

      const aggregate = await transaction.purchaseOrderAmendment.aggregate({
        where: { purchaseOrderId: purchaseOrder.id },
        _max: { version: true },
      });
      const now = new Date();
      const amendment = await transaction.purchaseOrderAmendment.create({
        data: {
          purchaseOrderId: purchaseOrder.id,
          version: (aggregate._max.version ?? 0) + 1,
          status: "PENDING_APPROVAL",
          reason: input.reason,
          proposedExpectedDeliveryDate: parseDate(input.expectedDeliveryDate),
          proposedPaymentTerms: input.paymentTerms,
          proposedFreightAmount: new Prisma.Decimal(input.freightAmount),
          createdById: principal.userId,
          submittedAt: now,
          lines: {
            create: purchaseOrder.lines.map((line) => {
              const proposed = proposedByLine.get(line.id)!;
              return {
                purchaseOrderLineId: line.id,
                proposedQuantity: new Prisma.Decimal(proposed.quantity),
                proposedUnitPrice: new Prisma.Decimal(proposed.unitPrice),
              };
            }),
          },
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.SUBMIT,
          entityType: "PurchaseOrderAmendment",
          entityId: amendment.id,
          reason: input.reason,
          after: {
            purchaseOrderId: purchaseOrder.id,
            version: amendment.version,
            status: "PENDING_APPROVAL",
          },
        },
        transaction,
      );
      return { id: amendment.id };
    });
  },

  async decide(
    principal: AuthenticatedPrincipal,
    input: DecidePurchaseOrderAmendmentInput,
  ) {
    requirePermission(principal, "purchase.approve");
    requireProjectDirector(principal);

    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "PurchaseOrderAmendment"
        WHERE "id" = ${input.amendmentId}::uuid
        FOR UPDATE
      `;
      const amendment = await transaction.purchaseOrderAmendment.findUnique({
        where: { id: input.amendmentId },
        include: {
          lines: true,
          purchaseOrder: { include: { lines: true } },
        },
      });
      if (!amendment) {
        throw new AppError("NOT_FOUND", "PO amendment not found.");
      }
      if (amendment.status !== "PENDING_APPROVAL") {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only a pending PO amendment can be decided.",
        );
      }
      await transaction.$queryRaw`
        SELECT "id" FROM "PurchaseOrder"
        WHERE "id" = ${amendment.purchaseOrderId}::uuid
        FOR UPDATE
      `;
      const currentPurchaseOrder =
        await transaction.purchaseOrder.findUniqueOrThrow({
          where: { id: amendment.purchaseOrderId },
          include: { lines: true },
        });
      if (amendment.createdById === principal.userId) {
        throw new AppError(
          "FORBIDDEN",
          "The amendment creator cannot approve it.",
        );
      }
      const now = new Date();
      if (input.decision === "REJECT") {
        await transaction.purchaseOrderAmendment.update({
          where: { id: amendment.id },
          data: {
            status: "REJECTED",
            decidedById: principal.userId,
            decidedAt: now,
            decisionReason: input.reason,
          },
        });
        await AuditService.record(
          {
            actorUserId: principal.userId,
            action: AuditAction.REJECT,
            entityType: "PurchaseOrderAmendment",
            entityId: amendment.id,
            reason: input.reason,
            before: { status: "PENDING_APPROVAL" },
            after: { status: "REJECTED" },
          },
          transaction,
        );
        return { id: amendment.id };
      }

      if (
        currentPurchaseOrder.status !== "ISSUED" &&
        currentPurchaseOrder.status !== "ACCEPTED" &&
        currentPurchaseOrder.status !== "PARTIALLY_RECEIVED"
      ) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "The purchase order is no longer open for amendment.",
        );
      }
      const lineById = new Map(
        amendment.lines.map((line) => [line.purchaseOrderLineId, line]),
      );
      let subtotal = new Prisma.Decimal(0);
      for (const poLine of currentPurchaseOrder.lines) {
        const proposed = lineById.get(poLine.id);
        if (!proposed) {
          throw new AppError("CONFLICT", "Amendment line set is incomplete.");
        }
        const lineSubtotal = proposed.proposedQuantity
          .mul(proposed.proposedUnitPrice)
          .toDecimalPlaces(2);
        subtotal = subtotal.add(lineSubtotal);
        await transaction.purchaseOrderLine.update({
          where: { id: poLine.id },
          data: {
            quantity: proposed.proposedQuantity,
            unitPrice: proposed.proposedUnitPrice,
            lineSubtotal,
          },
        });
      }
      const gstAmount = subtotal
        .mul(currentPurchaseOrder.gstRate)
        .div(100)
        .toDecimalPlaces(2);
      const totalAmount = subtotal
        .add(gstAmount)
        .add(amendment.proposedFreightAmount)
        .toDecimalPlaces(2);
      await transaction.purchaseOrder.update({
        where: { id: amendment.purchaseOrderId },
        data: {
          expectedDeliveryDate: amendment.proposedExpectedDeliveryDate,
          paymentTerms: amendment.proposedPaymentTerms,
          freightAmount: amendment.proposedFreightAmount,
          subtotal,
          gstAmount,
          totalAmount,
        },
      });
      await transaction.purchaseOrderAmendment.update({
        where: { id: amendment.id },
        data: {
          status: "APPROVED",
          decidedById: principal.userId,
          decidedAt: now,
          decisionReason: input.reason,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.APPROVE,
          entityType: "PurchaseOrderAmendment",
          entityId: amendment.id,
          reason: input.reason,
          before: { status: "PENDING_APPROVAL" },
          after: {
            status: "APPROVED",
            purchaseOrderId: amendment.purchaseOrderId,
            version: amendment.version,
            subtotal: subtotal.toString(),
            totalAmount: totalAmount.toString(),
          },
        },
        transaction,
      );
      return { id: amendment.id };
    });
  },
};
