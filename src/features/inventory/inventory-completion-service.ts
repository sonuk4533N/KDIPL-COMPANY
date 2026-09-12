import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import type {
  UpdateGoodsReceiptDraftInput,
  UpdateGoodsReceiptExceptionInput,
} from "@/features/inventory/inventory-completion-schemas";
import { calculateReceiptQuantities } from "@/server/inventory/domain";
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
      "Only the Purchase Manager can manage GRN drafts or close a purchase order.",
    );
  }
}

function requireReceivingRole(principal: AuthenticatedPrincipal) {
  const isStoreKeeper = principal.roleCodes.includes("STORE_KEEPER");
  const isSiteSupervisor = principal.roleCodes.includes("SITE_SUPERVISOR");
  if (
    (!isStoreKeeper && !isSiteSupervisor) ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only an authorized Store Keeper or Site Supervisor can manage receiving records.",
    );
  }
  return { isStoreKeeper, isSiteSupervisor };
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid date.");
  }
  return date;
}

function parseDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid receipt date/time.");
  }
  return date;
}

async function validateReceivingLocation(
  transaction: Prisma.TransactionClient,
  _principal: AuthenticatedPrincipal,
  values: { locationId: string; projectId: string; siteId: string },
) {
  const location = await transaction.inventoryLocation.findFirst({
    where: { id: values.locationId, isActive: true },
  });
  if (!location) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Select an active inventory location.",
    );
  }

  const sameProject = location.projectId === values.projectId;
  const sameSite = location.siteId === values.siteId;
  const allowedForPo =
    location.type === "CENTRAL_STORE" ||
    (location.type === "PROJECT_STORE" && sameProject) ||
    (location.type === "SITE_STORE" && sameProject && sameSite) ||
    (location.type === "TEMPORARY_STORE" && sameProject);
  if (!allowedForPo) {
    throw new AppError(
      "FORBIDDEN",
      "The receiving location is outside this purchase order's project/site scope.",
    );
  }

  return location;
}

async function previousPostedTotals(
  transaction: Prisma.TransactionClient,
  purchaseOrderLineIds: string[],
) {
  const rows = await transaction.goodsReceiptLine.findMany({
    where: {
      purchaseOrderLineId: { in: purchaseOrderLineIds },
      goodsReceipt: { status: "POSTED" },
    },
    select: {
      purchaseOrderLineId: true,
      acceptedQuantity: true,
      damagedQuantity: true,
      rejectedQuantity: true,
    },
  });
  const totals = new Map<
    string,
    { accepted: number; damaged: number; rejected: number }
  >();
  for (const row of rows) {
    const current = totals.get(row.purchaseOrderLineId) ?? {
      accepted: 0,
      damaged: 0,
      rejected: 0,
    };
    current.accepted += Number(row.acceptedQuantity);
    current.damaged += Number(row.damagedQuantity);
    current.rejected += Number(row.rejectedQuantity);
    totals.set(row.purchaseOrderLineId, current);
  }
  return totals;
}

const exceptionTransitions: Record<string, Set<string>> = {
  OPEN: new Set(["OPEN", "REPLACEMENT_EXPECTED", "RETURN_PENDING", "RESOLVED"]),
  REPLACEMENT_EXPECTED: new Set([
    "REPLACEMENT_EXPECTED",
    "RETURN_PENDING",
    "RESOLVED",
  ]),
  RETURN_PENDING: new Set(["RETURN_PENDING", "RETURNED", "RESOLVED"]),
  RETURNED: new Set(["RETURNED", "RESOLVED"]),
  RESOLVED: new Set(["RESOLVED"]),
};

export const InventoryCompletionService = {
  async closePurchaseOrder(
    principal: AuthenticatedPrincipal,
    purchaseOrderId: string,
    shortCloseReason?: string,
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);

    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "PurchaseOrder"
        WHERE "id" = ${purchaseOrderId}::uuid
        FOR UPDATE
      `;
      const purchaseOrder = await transaction.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        select: { id: true, status: true },
      });
      if (!purchaseOrder)
        throw new AppError("NOT_FOUND", "Purchase order not found.");
      if (
        purchaseOrder.status !== "RECEIVED" &&
        purchaseOrder.status !== "PARTIALLY_RECEIVED"
      ) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only a received or partially received purchase order can be closed.",
        );
      }
      if (
        purchaseOrder.status === "PARTIALLY_RECEIVED" &&
        (!shortCloseReason || shortCloseReason.trim().length < 3)
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "A reason is required to short-close a partially received purchase order.",
        );
      }

      const draftReceipts = await transaction.goodsReceipt.count({
        where: {
          purchaseOrderId,
          status: {
            in: ["DRAFT", "PHYSICALLY_VERIFIED", "PENDING_PM_APPROVAL"],
          },
        },
      });
      if (draftReceipts) {
        throw new AppError(
          "CONFLICT",
          "Cancel or post all draft GRNs before closing the purchase order.",
        );
      }

      const unresolved = await transaction.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM "GoodsReceiptException" e
        JOIN "GoodsReceiptLine" l ON l."id" = e."goodsReceiptLineId"
        JOIN "GoodsReceipt" g ON g."id" = l."goodsReceiptId"
        WHERE g."purchaseOrderId" = ${purchaseOrderId}::uuid
          AND e."status" IN (
            'OPEN'::"GoodsReceiptExceptionStatus",
            'REPLACEMENT_EXPECTED'::"GoodsReceiptExceptionStatus",
            'RETURN_PENDING'::"GoodsReceiptExceptionStatus"
          )
      `;
      if (Number(unresolved[0]?.count ?? BigInt(0)) > 0) {
        throw new AppError(
          "CONFLICT",
          "Resolve or return all damaged/rejected material before closing the purchase order.",
        );
      }

      const now = new Date();
      const changed = await transaction.purchaseOrder.updateMany({
        where: { id: purchaseOrderId, status: purchaseOrder.status },
        data: {
          status: "CLOSED",
          closedById: principal.userId,
          closedAt: now,
          shortCloseReason:
            purchaseOrder.status === "PARTIALLY_RECEIVED"
              ? shortCloseReason
              : null,
        },
      });
      if (changed.count !== 1) {
        throw new AppError(
          "CONFLICT",
          "Purchase-order state changed concurrently.",
        );
      }

      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "PurchaseOrder",
          entityId: purchaseOrderId,
          reason:
            purchaseOrder.status === "PARTIALLY_RECEIVED"
              ? shortCloseReason
              : undefined,
          before: { status: purchaseOrder.status },
          after: {
            status: "CLOSED",
            closedAt: now,
            shortCloseReason:
              purchaseOrder.status === "PARTIALLY_RECEIVED"
                ? shortCloseReason
                : null,
          },
        },
        transaction,
      );
      return { id: purchaseOrderId };
    });
  },

  async cancelGoodsReceiptDraft(
    principal: AuthenticatedPrincipal,
    goodsReceiptId: string,
    reason: string,
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);

    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "GoodsReceipt"
        WHERE "id" = ${goodsReceiptId}::uuid
        FOR UPDATE
      `;
      const receipt = await transaction.goodsReceipt.findUnique({
        where: { id: goodsReceiptId },
        include: {
          purchaseOrder: {
            select: {
              rfq: {
                select: {
                  requirement: { select: { projectId: true, siteId: true } },
                },
              },
            },
          },
        },
      });
      if (!receipt) throw new AppError("NOT_FOUND", "GRN not found.");
      if (
        receipt.status !== "DRAFT" &&
        receipt.status !== "PHYSICALLY_VERIFIED" &&
        receipt.status !== "PENDING_PM_APPROVAL"
      ) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only an unposted GRN can be cancelled.",
        );
      }
      const previousStatus = receipt.status;
      await validateReceivingLocation(transaction, principal, {
        locationId: receipt.locationId,
        projectId: receipt.purchaseOrder.rfq.requirement.projectId,
        siteId: receipt.purchaseOrder.rfq.requirement.siteId,
      });

      const now = new Date();
      const changed = await transaction.goodsReceipt.updateMany({
        where: { id: goodsReceiptId, status: previousStatus },
        data: {
          status: "CANCELLED",
          cancelledById: principal.userId,
          cancelledAt: now,
          cancellationReason: reason,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");

      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CANCEL,
          entityType: "GoodsReceipt",
          entityId: goodsReceiptId,
          reason,
          before: { status: previousStatus },
          after: { status: "CANCELLED", cancelledAt: now },
        },
        transaction,
      );
      return { id: goodsReceiptId };
    });
  },

  async updateGoodsReceiptDraft(
    principal: AuthenticatedPrincipal,
    input: UpdateGoodsReceiptDraftInput,
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);

    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "GoodsReceipt"
        WHERE "id" = ${input.goodsReceiptId}::uuid
        FOR UPDATE
      `;
      const receipt = await transaction.goodsReceipt.findUnique({
        where: { id: input.goodsReceiptId },
        include: {
          lines: true,
          purchaseOrder: {
            include: {
              lines: true,
              rfq: {
                select: {
                  requirement: { select: { projectId: true, siteId: true } },
                },
              },
            },
          },
        },
      });
      if (!receipt) throw new AppError("NOT_FOUND", "GRN not found.");
      if (receipt.status !== "DRAFT") {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only a draft GRN can be edited.",
        );
      }
      if (
        receipt.purchaseOrder.status !== "ISSUED" &&
        receipt.purchaseOrder.status !== "ACCEPTED" &&
        receipt.purchaseOrder.status !== "PARTIALLY_RECEIVED"
      ) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "The purchase order is no longer open for receiving.",
        );
      }

      const location = await validateReceivingLocation(transaction, principal, {
        locationId: input.locationId,
        projectId: receipt.purchaseOrder.rfq.requirement.projectId,
        siteId: receipt.purchaseOrder.rfq.requirement.siteId,
      });
      if (input.directSiteDelivery && location.type !== "SITE_STORE") {
        throw new AppError(
          "VALIDATION_ERROR",
          "Direct-site delivery must be received into the PO site's SITE_STORE.",
        );
      }

      if (input.lines.length !== receipt.lines.length) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Record quantities for every GRN line.",
        );
      }
      const existingById = new Map(
        receipt.lines.map((line) => [line.id, line]),
      );
      const poLineById = new Map(
        receipt.purchaseOrder.lines.map((line) => [line.id, line]),
      );
      const previous = await previousPostedTotals(
        transaction,
        receipt.purchaseOrder.lines.map(({ id }) => id),
      );

      const prepared = input.lines.map((line) => {
        const existing = existingById.get(line.goodsReceiptLineId);
        if (!existing) {
          throw new AppError("VALIDATION_ERROR", "Invalid GRN line.");
        }
        const poLine = poLineById.get(existing.purchaseOrderLineId);
        if (!poLine) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Invalid purchase-order line.",
          );
        }
        const prior = previous.get(poLine.id) ?? {
          accepted: 0,
          damaged: 0,
          rejected: 0,
        };
        const result = calculateReceiptQuantities({
          orderedQuantity: Number(poLine.quantity),
          previouslyAcceptedQuantity: prior.accepted,
          previouslyDamagedQuantity: prior.damaged,
          previouslyRejectedQuantity: prior.rejected,
          acceptedQuantity: line.acceptedQuantity,
          damagedQuantity: line.damagedQuantity,
          rejectedQuantity: line.rejectedQuantity,
          allowExcess: true,
        });
        return { existing, line, result };
      });

      if (!prepared.some(({ result }) => result.receivedQuantity > 0)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Record at least one received quantity.",
        );
      }

      await transaction.goodsReceipt.update({
        where: { id: receipt.id },
        data: {
          locationId: location.id,
          supplierDeliveryNote: input.supplierDeliveryNote,
          supplierDeliveryNoteDate: parseDate(input.supplierDeliveryNoteDate),
          vehicleNumber: input.vehicleNumber,
          transporter: input.transporter,
          directSiteDelivery: input.directSiteDelivery,
          gpsLatitude:
            input.gpsLatitude === undefined
              ? null
              : new Prisma.Decimal(input.gpsLatitude),
          gpsLongitude:
            input.gpsLongitude === undefined
              ? null
              : new Prisma.Decimal(input.gpsLongitude),
          gpsCapturedAt: input.gpsCapturedAt
            ? parseDateTime(input.gpsCapturedAt)
            : null,
          receiverName: input.receiverName,
          receivedAt: parseDateTime(input.receivedAt),
          notes: input.notes,
        },
      });
      for (const { existing, line, result } of prepared) {
        await transaction.goodsReceiptLine.update({
          where: { id: existing.id },
          data: {
            receivedQuantity: new Prisma.Decimal(result.receivedQuantity),
            acceptedQuantity: new Prisma.Decimal(line.acceptedQuantity),
            damagedQuantity: new Prisma.Decimal(line.damagedQuantity),
            rejectedQuantity: new Prisma.Decimal(line.rejectedQuantity),
            notes: line.notes,
          },
        });
      }

      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "GoodsReceipt",
          entityId: receipt.id,
          before: { status: "DRAFT", locationId: receipt.locationId },
          after: {
            status: "DRAFT",
            locationId: location.id,
            receivedAt: parseDateTime(input.receivedAt),
            lineCount: prepared.length,
          },
        },
        transaction,
      );
      return { id: receipt.id };
    });
  },

  async updateGoodsReceiptException(
    principal: AuthenticatedPrincipal,
    input: UpdateGoodsReceiptExceptionInput,
  ) {
    requirePermission(principal, "inventory.receive");
    requireReceivingRole(principal);

    return db.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{
          id: string;
          status: string;
          locationId: string;
          projectId: string;
          siteId: string;
        }>
      >`
        SELECT e."id", e."status"::text AS "status", g."locationId",
               mr."projectId", mr."siteId"
        FROM "GoodsReceiptException" e
        JOIN "GoodsReceiptLine" l ON l."id" = e."goodsReceiptLineId"
        JOIN "GoodsReceipt" g ON g."id" = l."goodsReceiptId"
        JOIN "PurchaseOrder" po ON po."id" = g."purchaseOrderId"
        JOIN "RequestForQuotation" rfq ON rfq."id" = po."rfqId"
        JOIN "MaterialRequirement" mr ON mr."id" = rfq."requirementId"
        WHERE e."id" = ${input.exceptionId}::uuid
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current)
        throw new AppError("NOT_FOUND", "Receipt exception not found.");
      await validateReceivingLocation(transaction, principal, {
        locationId: current.locationId,
        projectId: current.projectId,
        siteId: current.siteId,
      });

      if (!exceptionTransitions[current.status]?.has(input.status)) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "That exception status transition is not allowed.",
        );
      }
      if (
        (input.status === "RETURNED" || input.status === "RESOLVED") &&
        !input.evidenceReference &&
        !input.resolutionNotes
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Return or resolution requires evidence reference or resolution notes.",
        );
      }

      await transaction.$executeRaw`
        UPDATE "GoodsReceiptException"
        SET "status" = ${input.status}::"GoodsReceiptExceptionStatus",
            "evidenceReference" = ${input.evidenceReference ?? null},
            "resolutionNotes" = ${input.resolutionNotes ?? null},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.exceptionId}::uuid
      `;

      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "GoodsReceiptException",
          entityId: input.exceptionId,
          before: { status: current.status },
          after: {
            status: input.status,
            evidenceReference: input.evidenceReference ?? null,
            resolutionNotes: input.resolutionNotes ?? null,
          },
        },
        transaction,
      );
      return { id: input.exceptionId };
    });
  },
};
