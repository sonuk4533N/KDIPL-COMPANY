import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import {
  type GoodsReceiptDraftInput,
  type PurchaseOrderAcceptanceInput,
  type PurchaseOrderCancelInput,
} from "@/features/inventory/inventory-schemas";
import {
  calculateReceiptQuantities,
  canPostGoodsReceipt,
  purchaseOrderStatusAfterReceipt,
  type PurchaseOrderStatus,
} from "@/server/inventory/domain";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import { TransactionNumberService } from "@/server/transactions/transaction-number-service";
import type { AuthenticatedPrincipal } from "@/types/application";

function requirePurchaseManager(principal: AuthenticatedPrincipal) {
  if (
    !principal.roleCodes.includes("PURCHASE_MANAGER") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only the Purchase Manager can manage purchase-order issue and supplier acceptance.",
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
      "Only an authorized Store Keeper or Site Supervisor can receive material.",
    );
  }
  return { isStoreKeeper, isSiteSupervisor };
}

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()))
    throw new AppError("VALIDATION_ERROR", "Invalid date.");
  return date;
}

function parseDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new AppError("VALIDATION_ERROR", "Invalid receipt date/time.");
  return date;
}

async function requireReceivablePurchaseOrder(
  transaction: Prisma.TransactionClient,
  purchaseOrderId: string,
) {
  const purchaseOrder = await transaction.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      lines: {
        orderBy: { position: "asc" },
        include: {
          requirementLine: {
            select: {
              materialId: true,
              material: { select: { materialCode: true, name: true } },
            },
          },
          unit: { select: { symbol: true } },
        },
      },
      rfq: {
        select: {
          requirement: { select: { projectId: true, siteId: true } },
        },
      },
      supplier: { select: { legalName: true, tradeName: true } },
    },
  });
  if (!purchaseOrder)
    throw new AppError("NOT_FOUND", "Purchase order not found.");
  const status = String(purchaseOrder.status) as PurchaseOrderStatus;
  if (!canPostGoodsReceipt(status)) {
    throw new AppError(
      "INVALID_STATUS_TRANSITION",
      "Material can be received only after supplier acceptance.",
    );
  }
  return { purchaseOrder, status };
}

async function validateReceivingLocation(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  values: { locationId: string; projectId: string; siteId: string },
) {
  const roles = requireReceivingRole(principal);
  const location = await transaction.inventoryLocation.findFirst({
    where: { id: values.locationId, isActive: true },
  });
  if (!location)
    throw new AppError(
      "VALIDATION_ERROR",
      "Select an active inventory location.",
    );

  const sameProject = location.projectId === values.projectId;
  const sameSite = location.siteId === values.siteId;
  const allowedForPo =
    location.type === "CENTRAL_STORE" ||
    (location.type === "PROJECT_STORE" && sameProject) ||
    (location.type === "SITE_STORE" && sameProject && sameSite);
  if (!allowedForPo) {
    throw new AppError(
      "FORBIDDEN",
      "The selected receiving location is outside this purchase order's project/site scope.",
    );
  }

  if (!roles.isStoreKeeper && roles.isSiteSupervisor) {
    if (location.type !== "SITE_STORE" || !sameSite || !principal.employeeId) {
      throw new AppError(
        "FORBIDDEN",
        "Site Supervisors may receive only direct deliveries into their assigned site store.",
      );
    }
    const assignment = await transaction.siteAssignment.findFirst({
      where: {
        siteId: values.siteId,
        employeeId: principal.employeeId,
        role: "SITE_SUPERVISOR",
        isActive: true,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new AppError(
        "FORBIDDEN",
        "An active Site Supervisor assignment is required for direct-site receipt.",
      );
    }
  }
  return location;
}

async function previousReceiptTotals(
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

export const InventoryService = {
  async issuePurchaseOrder(
    principal: AuthenticatedPrincipal,
    purchaseOrderId: string,
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);
    return db.$transaction(async (transaction) => {
      const now = new Date();
      const changed = await transaction.$queryRaw<Array<{ id: string }>>`
        UPDATE "PurchaseOrder"
        SET "status" = 'ISSUED'::"PurchaseOrderStatus",
            "issuedById" = ${principal.userId}::uuid,
            "issuedAt" = ${now}
        WHERE "id" = ${purchaseOrderId}::uuid
          AND "status" = 'DRAFT'::"PurchaseOrderStatus"
        RETURNING "id"
      `;
      if (!changed.length)
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only a draft purchase order can be issued.",
        );
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "PurchaseOrder",
          entityId: purchaseOrderId,
          before: { status: "DRAFT" },
          after: { status: "ISSUED", issuedAt: now },
        },
        transaction,
      );
      return { id: purchaseOrderId };
    });
  },

  async recordSupplierAcceptance(
    principal: AuthenticatedPrincipal,
    input: PurchaseOrderAcceptanceInput,
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);
    return db.$transaction(async (transaction) => {
      const acceptedAt = parseDate(input.supplierAcceptedAt);
      const changed = await transaction.$queryRaw<Array<{ id: string }>>`
        UPDATE "PurchaseOrder"
        SET "status" = 'ACCEPTED'::"PurchaseOrderStatus",
            "supplierAcceptedAt" = ${acceptedAt},
            "supplierAcceptanceReference" = ${input.supplierAcceptanceReference},
            "acceptedRecordedById" = ${principal.userId}::uuid
        WHERE "id" = ${input.purchaseOrderId}::uuid
          AND "status" = 'ISSUED'::"PurchaseOrderStatus"
        RETURNING "id"
      `;
      if (!changed.length)
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only an issued purchase order can be marked supplier accepted.",
        );
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "PurchaseOrder",
          entityId: input.purchaseOrderId,
          before: { status: "ISSUED" },
          after: {
            status: "ACCEPTED",
            supplierAcceptedAt: acceptedAt,
            supplierAcceptanceReference: input.supplierAcceptanceReference,
          },
        },
        transaction,
      );
      return { id: input.purchaseOrderId };
    });
  },

  async cancelPurchaseOrder(
    principal: AuthenticatedPrincipal,
    input: PurchaseOrderCancelInput,
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);
    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "PurchaseOrder"
        WHERE "id" = ${input.purchaseOrderId}::uuid
        FOR UPDATE
      `;
      const postedReceipts = await transaction.goodsReceipt.count({
        where: { purchaseOrderId: input.purchaseOrderId, status: "POSTED" },
      });
      if (postedReceipts) {
        throw new AppError(
          "CONFLICT",
          "A purchase order with posted receipts cannot be cancelled; use the controlled return/reversal workflow.",
        );
      }
      const now = new Date();
      const changed = await transaction.$queryRaw<Array<{ id: string }>>`
        UPDATE "PurchaseOrder"
        SET "status" = 'CANCELLED'::"PurchaseOrderStatus",
            "cancelledById" = ${principal.userId}::uuid,
            "cancelledAt" = ${now},
            "cancellationReason" = ${input.reason}
        WHERE "id" = ${input.purchaseOrderId}::uuid
          AND "status" IN ('DRAFT'::"PurchaseOrderStatus", 'ISSUED'::"PurchaseOrderStatus", 'ACCEPTED'::"PurchaseOrderStatus")
        RETURNING "id"
      `;
      if (!changed.length) throw new AppError("INVALID_STATUS_TRANSITION");
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CANCEL,
          entityType: "PurchaseOrder",
          entityId: input.purchaseOrderId,
          reason: input.reason,
          after: { status: "CANCELLED", cancelledAt: now },
        },
        transaction,
      );
      return { id: input.purchaseOrderId };
    });
  },

  async createGoodsReceiptDraft(
    principal: AuthenticatedPrincipal,
    input: GoodsReceiptDraftInput,
  ) {
    requirePermission(principal, "inventory.receive");
    return db.$transaction(async (transaction) => {
      if (input.goodsReceiptId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Editing existing GRN drafts will be enabled in the next UI increment; create a new draft for now.",
        );
      }
      await transaction.$queryRaw`
        SELECT "id" FROM "PurchaseOrder"
        WHERE "id" = ${input.purchaseOrderId}::uuid
        FOR UPDATE
      `;
      const { purchaseOrder } = await requireReceivablePurchaseOrder(
        transaction,
        input.purchaseOrderId,
      );
      const location = await validateReceivingLocation(transaction, principal, {
        locationId: input.locationId,
        projectId: purchaseOrder.rfq.requirement.projectId,
        siteId: purchaseOrder.rfq.requirement.siteId,
      });
      const lineById = new Map(
        purchaseOrder.lines.map((line) => [line.id, line]),
      );
      if (input.lines.length !== purchaseOrder.lines.length) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Record quantities for every purchase-order line.",
        );
      }
      const previous = await previousReceiptTotals(
        transaction,
        purchaseOrder.lines.map(({ id }) => id),
      );
      const prepared = input.lines.map((line) => {
        const poLine = lineById.get(line.purchaseOrderLineId);
        if (!poLine)
          throw new AppError(
            "VALIDATION_ERROR",
            "Invalid purchase-order line.",
          );
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
        });
        return { poLine, input: line, result };
      });
      if (!prepared.some(({ result }) => result.receivedQuantity > 0)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Record at least one received quantity.",
        );
      }
      const now = new Date();
      const goodsReceipt = await transaction.goodsReceipt.create({
        data: {
          grnNumber: await TransactionNumberService.next(
            "GRN",
            now,
            transaction,
          ),
          purchaseOrderId: purchaseOrder.id,
          locationId: location.id,
          supplierDeliveryNote: input.supplierDeliveryNote,
          receivedAt: parseDateTime(input.receivedAt),
          notes: input.notes,
          createdById: principal.userId,
          lines: {
            create: prepared.map(({ poLine, input: line, result }) => ({
              purchaseOrderLineId: poLine.id,
              materialId: poLine.requirementLine.materialId,
              unitId: poLine.unitId,
              orderedQuantity: poLine.quantity,
              receivedQuantity: new Prisma.Decimal(result.receivedQuantity),
              acceptedQuantity: new Prisma.Decimal(line.acceptedQuantity),
              damagedQuantity: new Prisma.Decimal(line.damagedQuantity),
              rejectedQuantity: new Prisma.Decimal(line.rejectedQuantity),
              notes: line.notes,
            })),
          },
        },
      });
      if (
        input.supplierDeliveryNoteDate ||
        input.vehicleNumber ||
        input.transporter
      ) {
        await transaction.$executeRaw`
          UPDATE "GoodsReceipt"
          SET "supplierDeliveryNoteDate" = ${input.supplierDeliveryNoteDate ? parseDate(input.supplierDeliveryNoteDate) : null},
              "vehicleNumber" = ${input.vehicleNumber ?? null},
              "transporter" = ${input.transporter ?? null}
          WHERE "id" = ${goodsReceipt.id}::uuid
        `;
      }
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "GoodsReceipt",
          entityId: goodsReceipt.id,
          after: {
            grnNumber: goodsReceipt.grnNumber,
            purchaseOrderId: purchaseOrder.id,
            locationId: location.id,
            lineCount: prepared.length,
          },
        },
        transaction,
      );
      return { id: goodsReceipt.id };
    });
  },

  async postGoodsReceipt(
    principal: AuthenticatedPrincipal,
    goodsReceiptId: string,
  ) {
    requirePermission(principal, "inventory.receive");
    requireReceivingRole(principal);
    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT po."id"
        FROM "PurchaseOrder" po
        JOIN "GoodsReceipt" gr ON gr."purchaseOrderId" = po."id"
        WHERE gr."id" = ${goodsReceiptId}::uuid
        FOR UPDATE OF po
      `;
      await transaction.$queryRaw`
        SELECT "id" FROM "GoodsReceipt"
        WHERE "id" = ${goodsReceiptId}::uuid
        FOR UPDATE
      `;
      const receipt = await transaction.goodsReceipt.findUnique({
        where: { id: goodsReceiptId },
        include: {
          location: true,
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
      if (!receipt) throw new AppError("NOT_FOUND");
      if (receipt.status === "POSTED")
        throw new AppError(
          "DUPLICATE_TRANSACTION",
          "This GRN is already posted.",
        );
      if (receipt.status !== "DRAFT")
        throw new AppError("INVALID_STATUS_TRANSITION");
      const poStatus = String(
        receipt.purchaseOrder.status,
      ) as PurchaseOrderStatus;
      if (!canPostGoodsReceipt(poStatus))
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "The purchase order is not open for receiving.",
        );
      await validateReceivingLocation(transaction, principal, {
        locationId: receipt.locationId,
        projectId: receipt.purchaseOrder.rfq.requirement.projectId,
        siteId: receipt.purchaseOrder.rfq.requirement.siteId,
      });

      const previous = await previousReceiptTotals(
        transaction,
        receipt.purchaseOrder.lines.map(({ id }) => id),
      );
      const currentByPoLine = new Map(
        receipt.lines.map((line) => [line.purchaseOrderLineId, line]),
      );
      const cumulativeAccepted = new Map<string, number>();
      for (const poLine of receipt.purchaseOrder.lines) {
        const line = currentByPoLine.get(poLine.id);
        const prior = previous.get(poLine.id) ?? {
          accepted: 0,
          damaged: 0,
          rejected: 0,
        };
        const currentAccepted = line ? Number(line.acceptedQuantity) : 0;
        const currentDamaged = line ? Number(line.damagedQuantity) : 0;
        const currentRejected = line ? Number(line.rejectedQuantity) : 0;
        calculateReceiptQuantities({
          orderedQuantity: Number(poLine.quantity),
          previouslyAcceptedQuantity: prior.accepted,
          previouslyDamagedQuantity: prior.damaged,
          previouslyRejectedQuantity: prior.rejected,
          acceptedQuantity: currentAccepted,
          damagedQuantity: currentDamaged,
          rejectedQuantity: currentRejected,
        });
        cumulativeAccepted.set(poLine.id, prior.accepted + currentAccepted);
      }

      const now = new Date();
      const changed = await transaction.goodsReceipt.updateMany({
        where: { id: receipt.id, status: "DRAFT" },
        data: { status: "POSTED", postedById: principal.userId, postedAt: now },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");

      for (const line of receipt.lines) {
        if (line.acceptedQuantity.lte(0)) continue;
        await transaction.stockTransaction.create({
          data: {
            transactionNumber: await TransactionNumberService.next(
              "STK",
              now,
              transaction,
            ),
            type: "RECEIPT",
            locationId: receipt.locationId,
            materialId: line.materialId,
            unitId: line.unitId,
            quantity: line.acceptedQuantity,
            goodsReceiptLineId: line.id,
            createdById: principal.userId,
          },
        });
      }

      const fullyReceived = receipt.purchaseOrder.lines.every((line) => {
        const accepted = cumulativeAccepted.get(line.id) ?? 0;
        return (
          purchaseOrderStatusAfterReceipt(Number(line.quantity), accepted) ===
          "RECEIVED"
        );
      });
      const targetStatus = fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED";
      const poChanged = await transaction.$queryRaw<Array<{ id: string }>>`
        UPDATE "PurchaseOrder"
        SET "status" = ${targetStatus}::"PurchaseOrderStatus"
        WHERE "id" = ${receipt.purchaseOrderId}::uuid
          AND "status" IN ('ACCEPTED'::"PurchaseOrderStatus", 'PARTIALLY_RECEIVED'::"PurchaseOrderStatus")
        RETURNING "id"
      `;
      if (!poChanged.length)
        throw new AppError(
          "CONFLICT",
          "Purchase-order receiving state changed concurrently.",
        );

      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.RECEIVE,
          entityType: "GoodsReceipt",
          entityId: receipt.id,
          before: { status: "DRAFT" },
          after: {
            status: "POSTED",
            postedAt: now,
            acceptedStockLines: receipt.lines.filter((line) =>
              line.acceptedQuantity.gt(0),
            ).length,
          },
        },
        transaction,
      );
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "PurchaseOrder",
          entityId: receipt.purchaseOrderId,
          before: { status: poStatus },
          after: { status: targetStatus },
        },
        transaction,
      );
      return {
        id: receipt.id,
        purchaseOrderId: receipt.purchaseOrderId,
        purchaseOrderStatus: targetStatus,
      };
    });
  },
};
