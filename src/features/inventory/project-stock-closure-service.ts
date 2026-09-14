import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { AuditService } from "@/server/audit/audit-service";
import {
  lockCustomerInventory,
  nextCustomerNumber,
  requireCustomerRole,
} from "./customer-movement-service";
import type { AuthenticatedPrincipal } from "@/types/application";

export const ProjectStockClosureService = {
  async synchronize(
    principal: AuthenticatedPrincipal,
    projectId: string,
    centralLocationId: string,
    reason: string,
  ) {
    return db.$transaction(
      async (tx) => {
        await lockCustomerInventory(tx);
        await requireCustomerRole(tx, principal, "PROJECT_DIRECTOR");
        const project = await tx.project.findUniqueOrThrow({
          where: { id: projectId },
        });
        if (!["ACTIVE", "ON_HOLD"].includes(project.status))
          throw new AppError(
            "CONFLICT",
            "Only an active/on-hold project can enter stock closure.",
          );
        const central = await tx.inventoryLocation.findFirst({
          where: {
            id: centralLocationId,
            type: "CENTRAL_STORE",
            isActive: true,
          },
        });
        if (!central)
          throw new AppError(
            "VALIDATION_ERROR",
            "Select an active Central Store.",
          );
        const closure = await tx.projectStockClosure.upsert({
          where: { projectId },
          create: { projectId, createdById: principal.userId },
          update: {},
        });
        if (closure.status !== "OPEN")
          throw new AppError("CONFLICT", "Stock closure is already complete.");
        const balances = await tx.$queryRaw<
          Array<{
            locationId: string;
            materialId: string;
            unitId: string;
            quantityOnHand: Prisma.Decimal;
          }>
        >`
        SELECT b.* FROM "InventoryStockBalance" b JOIN "InventoryLocation" l ON l.id=b."locationId"
        WHERE l."projectId"=${projectId}::uuid AND b."quantityOnHand">0 ORDER BY b."locationId",b."materialId",b."unitId"`;
        const created: string[] = [];
        for (const balance of balances) {
          // Account for pending closure transfers. Refresh after counts/returns to
          // collect additional stock; repeated refresh cannot duplicate quantities.
          const pending = await tx.customerStockMovement.aggregate({
            where: {
              kind: "TRANSFER",
              sourceLocationId: balance.locationId,
              materialId: balance.materialId,
              unitId: balance.unitId,
              status: { in: ["REQUESTED", "APPROVED", "DISPATCHED"] },
            },
            _sum: { quantity: true },
          });
          const quantity = balance.quantityOnHand.minus(
            pending._sum.quantity ?? 0,
          );
          if (quantity.lte(0)) continue;
          const movement = await tx.customerStockMovement.create({
            data: {
              kind: "TRANSFER",
              number: await nextCustomerNumber(tx, "TRF"),
              sourceLocationId: balance.locationId,
              destinationLocationId: central.id,
              materialId: balance.materialId,
              unitId: balance.unitId,
              quantity,
              reason,
              transitionReason: reason,
              closureProjectId: projectId,
              createdById: principal.userId,
              updatedById: principal.userId,
            },
          });
          created.push(movement.id);
          await AuditService.record(
            {
              actorUserId: principal.userId,
              action: "CREATE",
              entityType: "CustomerStockMovement",
              entityId: movement.id,
              after: movement,
              reason,
            },
            tx,
          );
        }
        await AuditService.record(
          {
            actorUserId: principal.userId,
            action: "UPDATE",
            entityType: "ProjectStockClosure",
            entityId: projectId,
            after: {
              status: "OPEN",
              centralLocationId,
              createdTransferIds: created,
            },
            reason,
          },
          tx,
        );
        return { id: projectId };
      },
      { timeout: 30_000 },
    );
  },

  async close(
    principal: AuthenticatedPrincipal,
    projectId: string,
    reason: string,
  ) {
    return db.$transaction(
      async (tx) => {
        await lockCustomerInventory(tx);
        await requireCustomerRole(tx, principal, "PROJECT_DIRECTOR");
        const closure = await tx.projectStockClosure.findUnique({
          where: { projectId },
        });
        if (closure?.status !== "OPEN")
          throw new AppError("CONFLICT", "Start project stock closure first.");
        // This same function is invoked by the database closure trigger, protecting
        // against direct status edits and races with Phase 5 posting.
        await tx.$queryRaw`SELECT "kdipl_assert_customer_closure"(${projectId}::uuid)::text`;
        await tx.projectStockClosure.update({
          where: { projectId },
          data: { status: "CLOSED", closedAt: new Date() },
        });
        await tx.project.update({
          where: { id: projectId },
          data: { status: "COMPLETED", actualCompletionDate: new Date() },
        });
        await AuditService.record(
          {
            actorUserId: principal.userId,
            action: "UPDATE",
            entityType: "ProjectStockClosure",
            entityId: projectId,
            before: closure,
            after: { status: "CLOSED" },
            reason,
          },
          tx,
        );
        return { id: projectId };
      },
      { timeout: 20_000 },
    );
  },
};
