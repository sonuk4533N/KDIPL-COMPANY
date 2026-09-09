import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import type {
  StockTransferCancelInput,
  StockTransferDraftInput,
} from "@/features/inventory/stock-transfer-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import { TransactionNumberService } from "@/server/transactions/transaction-number-service";
import type { AuthenticatedPrincipal } from "@/types/application";

function requireStoreKeeper(principal: AuthenticatedPrincipal) {
  if (
    !principal.roleCodes.includes("STORE_KEEPER") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only an authorized Store Keeper can create, dispatch, or cancel stock transfers.",
    );
  }
}

async function requireDestinationReceiver(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  destination: { siteId: string | null },
) {
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) {
    throw new AppError(
      "FORBIDDEN",
      "Operational administrators are read-only.",
    );
  }
  if (principal.roleCodes.includes("STORE_KEEPER")) return;
  if (
    !principal.roleCodes.includes("SITE_SUPERVISOR") ||
    !principal.employeeId ||
    !destination.siteId
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only a Store Keeper or the destination site's assigned supervisor can receive this transfer.",
    );
  }
  const assignment = await transaction.siteAssignment.findFirst({
    where: {
      siteId: destination.siteId,
      employeeId: principal.employeeId,
      role: "SITE_SUPERVISOR",
      isActive: true,
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new AppError(
      "FORBIDDEN",
      "Only the destination site's assigned supervisor can receive this transfer.",
    );
  }
}

export const StockTransferService = {
  async createDraft(
    principal: AuthenticatedPrincipal,
    input: StockTransferDraftInput,
  ) {
    requirePermission(principal, "inventory.transfer");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      const [source, destination, material] = await Promise.all([
        transaction.inventoryLocation.findFirst({
          where: { id: input.sourceLocationId, isActive: true },
          select: { id: true },
        }),
        transaction.inventoryLocation.findFirst({
          where: { id: input.destinationLocationId, isActive: true },
          select: { id: true },
        }),
        transaction.material.findFirst({
          where: { id: input.materialId, isActive: true },
          select: { id: true, defaultUnitId: true },
        }),
      ]);
      if (!source)
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an active source location.",
        );
      if (!destination)
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an active destination location.",
        );
      if (source.id === destination.id)
        throw new AppError(
          "VALIDATION_ERROR",
          "Destination must be different from the source.",
        );
      if (!material || material.defaultUnitId !== input.unitId)
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an active material with its configured unit.",
        );

      const now = new Date();
      const transfer = await transaction.stockTransfer.create({
        data: {
          transferNumber: await TransactionNumberService.next(
            "TR",
            now,
            transaction,
          ),
          sourceLocationId: source.id,
          destinationLocationId: destination.id,
          purpose: input.purpose,
          notes: input.notes,
          createdById: principal.userId,
          lines: {
            create: {
              materialId: material.id,
              unitId: input.unitId,
              quantity: new Prisma.Decimal(input.quantity),
            },
          },
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "StockTransfer",
          entityId: transfer.id,
          after: {
            transferNumber: transfer.transferNumber,
            status: "DRAFT",
            purpose: transfer.purpose,
            sourceLocationId: source.id,
            destinationLocationId: destination.id,
            materialId: material.id,
            unitId: input.unitId,
            quantity: input.quantity,
          },
        },
        transaction,
      );
      return { id: transfer.id };
    });
  },

  async dispatch(principal: AuthenticatedPrincipal, stockTransferId: string) {
    requirePermission(principal, "inventory.transfer");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "StockTransfer"
        WHERE "id" = ${stockTransferId}::uuid
        FOR UPDATE
      `;
      const transfer = await transaction.stockTransfer.findUnique({
        where: { id: stockTransferId },
        include: {
          lines: true,
          sourceLocation: { select: { isActive: true } },
          destinationLocation: { select: { isActive: true } },
        },
      });
      if (!transfer)
        throw new AppError("NOT_FOUND", "Stock transfer not found.");
      if (transfer.status === "DISPATCHED" || transfer.status === "RECEIVED") {
        throw new AppError(
          "DUPLICATE_TRANSACTION",
          "This stock transfer is already dispatched.",
        );
      }
      if (transfer.status !== "DRAFT")
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (
        !transfer.sourceLocation.isActive ||
        !transfer.destinationLocation.isActive
      )
        throw new AppError(
          "CONFLICT",
          "The source or destination location is no longer active.",
        );
      if (!transfer.lines.length)
        throw new AppError(
          "VALIDATION_ERROR",
          "Add at least one transfer line.",
        );

      const lines = [...transfer.lines].sort((left, right) =>
        `${left.materialId}:${left.unitId}`.localeCompare(
          `${right.materialId}:${right.unitId}`,
        ),
      );
      for (const line of lines) {
        await transaction.$queryRaw<Array<{ lockResult: string }>>`
          SELECT pg_advisory_xact_lock(hashtextextended(
            ${transfer.sourceLocationId}::text || ':' || ${line.materialId}::text || ':' || ${line.unitId}::text,
            0
          ))::text AS "lockResult"
        `;
        const balances = await transaction.$queryRaw<
          Array<{ quantityOnHand: Prisma.Decimal }>
        >`
          SELECT "quantityOnHand"
          FROM "InventoryStockBalance"
          WHERE "locationId" = ${transfer.sourceLocationId}::uuid
            AND "materialId" = ${line.materialId}::uuid
            AND "unitId" = ${line.unitId}::uuid
        `;
        const available = balances[0]?.quantityOnHand ?? new Prisma.Decimal(0);
        if (available.lt(line.quantity)) {
          throw new AppError(
            "INSUFFICIENT_STOCK",
            "There is not enough available stock to dispatch this transfer.",
          );
        }
      }

      const now = new Date();
      const changed = await transaction.stockTransfer.updateMany({
        where: { id: transfer.id, status: "DRAFT" },
        data: {
          status: "DISPATCHED",
          dispatchedById: principal.userId,
          dispatchedAt: now,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      for (const line of lines) {
        await transaction.stockTransaction.create({
          data: {
            transactionNumber: await TransactionNumberService.next(
              "STK",
              now,
              transaction,
            ),
            type: "TRANSFER_OUT",
            locationId: transfer.sourceLocationId,
            materialId: line.materialId,
            unitId: line.unitId,
            quantity: line.quantity,
            stockTransferLineId: line.id,
            createdById: principal.userId,
          },
        });
      }
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.TRANSFER,
          entityType: "StockTransfer",
          entityId: transfer.id,
          before: { status: "DRAFT" },
          after: { status: "DISPATCHED", dispatchedAt: now },
          metadata: { movement: "TRANSFER_OUT", lineCount: lines.length },
        },
        transaction,
      );
      return { id: transfer.id };
    });
  },

  async receive(principal: AuthenticatedPrincipal, stockTransferId: string) {
    requirePermission(principal, "inventory.transfer");
    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "StockTransfer"
        WHERE "id" = ${stockTransferId}::uuid
        FOR UPDATE
      `;
      const transfer = await transaction.stockTransfer.findUnique({
        where: { id: stockTransferId },
        include: {
          lines: true,
          destinationLocation: { select: { isActive: true, siteId: true } },
        },
      });
      if (!transfer)
        throw new AppError("NOT_FOUND", "Stock transfer not found.");
      await requireDestinationReceiver(
        transaction,
        principal,
        transfer.destinationLocation,
      );
      if (transfer.status === "RECEIVED") {
        throw new AppError(
          "DUPLICATE_TRANSACTION",
          "This stock transfer is already received.",
        );
      }
      if (transfer.status !== "DISPATCHED")
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (!transfer.destinationLocation.isActive)
        throw new AppError(
          "CONFLICT",
          "The destination location is no longer active.",
        );
      if (!transfer.lines.length)
        throw new AppError(
          "VALIDATION_ERROR",
          "The transfer has no lines to receive.",
        );

      const now = new Date();
      const changed = await transaction.stockTransfer.updateMany({
        where: { id: transfer.id, status: "DISPATCHED" },
        data: {
          status: "RECEIVED",
          receivedById: principal.userId,
          receivedAt: now,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      for (const line of transfer.lines) {
        await transaction.stockTransaction.create({
          data: {
            transactionNumber: await TransactionNumberService.next(
              "STK",
              now,
              transaction,
            ),
            type: "TRANSFER_IN",
            locationId: transfer.destinationLocationId,
            materialId: line.materialId,
            unitId: line.unitId,
            quantity: line.quantity,
            stockTransferLineId: line.id,
            createdById: principal.userId,
          },
        });
      }
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.RECEIVE,
          entityType: "StockTransfer",
          entityId: transfer.id,
          before: { status: "DISPATCHED" },
          after: { status: "RECEIVED", receivedAt: now },
          metadata: {
            movement: "TRANSFER_IN",
            lineCount: transfer.lines.length,
            evidence: "DESTINATION_RECEIPT",
          },
        },
        transaction,
      );
      return { id: transfer.id };
    });
  },

  async cancelDraft(
    principal: AuthenticatedPrincipal,
    input: StockTransferCancelInput,
  ) {
    requirePermission(principal, "inventory.transfer");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "StockTransfer"
        WHERE "id" = ${input.stockTransferId}::uuid
        FOR UPDATE
      `;
      const transfer = await transaction.stockTransfer.findUnique({
        where: { id: input.stockTransferId },
        select: { id: true, status: true },
      });
      if (!transfer)
        throw new AppError("NOT_FOUND", "Stock transfer not found.");
      if (transfer.status !== "DRAFT")
        throw new AppError("INVALID_STATUS_TRANSITION");
      const now = new Date();
      await transaction.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "CANCELLED",
          cancelledById: principal.userId,
          cancelledAt: now,
          cancellationReason: input.reason,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CANCEL,
          entityType: "StockTransfer",
          entityId: transfer.id,
          before: { status: "DRAFT" },
          after: { status: "CANCELLED", cancelledAt: now },
          reason: input.reason,
        },
        transaction,
      );
      return { id: transfer.id };
    });
  },
};
