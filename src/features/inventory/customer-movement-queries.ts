import "server-only";
import { db } from "@/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";

export async function getCustomerMovementWorkspace(
  principal: AuthenticatedPrincipal,
  documentId?: string,
) {
  requirePermission(principal, "inventory.view");
  const global = principal.roleCodes.some((code) =>
    [
      "STORE_KEEPER",
      "PROJECT_DIRECTOR",
      "MANAGING_DIRECTOR",
      "ACCOUNTS",
      "SYSTEM_ADMINISTRATOR",
    ].includes(code),
  );
  const now = new Date();
  const assignment = {
    employeeId: principal.employeeId ?? "00000000-0000-0000-0000-000000000000",
    isActive: true,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
  const scope: Prisma.InventoryLocationWhereInput = global
    ? {}
    : principal.roleCodes.includes("SITE_SUPERVISOR")
      ? {
          site: {
            assignments: { some: { ...assignment, role: "SITE_SUPERVISOR" } },
          },
        }
      : principal.roleCodes.includes("PROJECT_MANAGER")
        ? {
            project: {
              assignments: { some: { ...assignment, role: "PROJECT_MANAGER" } },
            },
          }
        : { id: "00000000-0000-0000-0000-000000000000" };
  if (
    !global &&
    !principal.roleCodes.some((code) =>
      ["SITE_SUPERVISOR", "PROJECT_MANAGER"].includes(code),
    )
  )
    throw new AppError("FORBIDDEN");
  const scopedLocations = await db.inventoryLocation.findMany({
    where: scope,
    select: { id: true },
  });
  const ids = scopedLocations.map((item) => item.id);
  const movements = await db.customerStockMovement.findMany({
    where: {
      id: documentId,
      AND: global
        ? {}
        : {
            OR: [
              { sourceLocationId: { in: ids } },
              { destinationLocationId: { in: ids } },
            ],
          },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      source: true,
      destination: true,
      material: true,
      unit: true,
      variance: true,
      originalIssue: { select: { number: true } },
    },
  });
  const [locations, materials, files, projects, negatives] = await Promise.all([
    db.inventoryLocation.findMany({
      where: {
        isActive: true,
        ...(global ? {} : { OR: [scope, { type: "CENTRAL_STORE" }] }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, siteId: true },
    }),
    db.material.findMany({
      where: { isActive: true },
      select: { id: true, name: true, defaultUnitId: true },
    }),
    db.fileRecord.findMany({
      where: {
        uploadedById: principal.userId,
        documentType: "STOCK_MOVEMENT_EVIDENCE",
        scanStatus: "CLEAN",
        retentionUntil: { gt: now },
      },
      orderBy: { uploadedAt: "desc" },
      take: 50,
      select: { id: true, filename: true },
    }),
    db.project.findMany({
      where: global
        ? { status: { in: ["ACTIVE", "ON_HOLD"] } }
        : { inventoryLocations: { some: { id: { in: ids } } } },
      select: {
        id: true,
        name: true,
        stockClosure: { select: { status: true } },
      },
    }),
    db.temporaryNegativeStockException.findMany({
      where: { status: "OPEN", ...(global ? {} : { locationId: { in: ids } }) },
      include: { location: true, material: true },
      orderBy: { resolutionDueAt: "asc" },
      take: 100,
    }),
  ]);
  return {
    locations,
    materials,
    files,
    projects,
    roleCodes: [...principal.roleCodes],
    movements: movements.map((m) => ({
      id: m.id,
      number: m.number,
      hasEvidence: !!m.evidenceId,
      kind: m.kind,
      status: m.status,
      source: m.source.name,
      destination: m.destination?.name ?? null,
      siteReceipt: !!m.destination?.siteId,
      material: m.material.name,
      unit: m.unit.symbol,
      quantity: m.quantity.toString(),
      actual: m.actualQuantity?.toString() ?? null,
      cost: m.unitCost?.toString() ?? null,
      approvedQuantity: m.approvedQuantity?.toString() ?? null,
      reason: m.reason,
      variance: m.variance
        ? `${m.variance.number}: ${m.variance.status}`
        : null,
      originalIssue: m.originalIssue?.number ?? null,
    })),
    negatives: negatives.map((n) => ({
      id: n.id,
      location: n.location.name,
      material: n.material.name,
      deficit: n.deficitQuantity.toString(),
      due: n.resolutionDueAt.toISOString(),
      reason: n.reason,
    })),
  };
}

export type CustomerMovementWorkspace = Awaited<
  ReturnType<typeof getCustomerMovementWorkspace>
>;
