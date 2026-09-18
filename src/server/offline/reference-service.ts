import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { OFFLINE_REFERENCE_MAX_AGE_MS } from "@/features/offline/offline-domain";
import type { AuthenticatedPrincipal } from "@/types/application";

const supportedRoles = new Set([
  "SITE_SUPERVISOR",
  "STORE_KEEPER",
  "PURCHASE_MANAGER",
  "PROJECT_MANAGER",
]);

export function canUseOfflineOperations(principal: AuthenticatedPrincipal) {
  return principal.roleCodes.some((role) => supportedRoles.has(role));
}

export async function getOfflineReferenceSnapshot(
  principal: AuthenticatedPrincipal,
) {
  const companyProcurement = principal.roleCodes.includes("PURCHASE_MANAGER");
  const locationAccess = principal.employeeId
    ? await db.inventoryLocationAccess.findMany({
        where: { employeeId: principal.employeeId, isActive: true },
        select: { locationId: true },
      })
    : [];
  const explicitLocationIds = locationAccess.map((access) => access.locationId);
  const explicitScope = explicitLocationIds.length
    ? await db.inventoryLocation.findMany({
        where: { id: { in: explicitLocationIds }, isActive: true },
        select: { projectId: true, siteId: true },
      })
    : [];
  const explicitProjectIds = explicitScope.flatMap((item) =>
    item.projectId ? [item.projectId] : [],
  );
  const explicitSiteIds = explicitScope.flatMap((item) =>
    item.siteId ? [item.siteId] : [],
  );
  const projectWhere: Prisma.ProjectWhereInput = companyProcurement
    ? { status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] } }
    : {
        status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] },
        OR: principal.employeeId
          ? [
              {
                assignments: {
                  some: { employeeId: principal.employeeId, isActive: true },
                },
              },
              {
                sites: {
                  some: {
                    assignments: {
                      some: {
                        employeeId: principal.employeeId,
                        isActive: true,
                      },
                    },
                  },
                },
              },
              { id: { in: explicitProjectIds } },
            ]
          : [{ id: "00000000-0000-0000-0000-000000000000" }],
      };

  const [projects, materials] = await Promise.all([
    db.project.findMany({
      where: projectWhere,
      orderBy: { name: "asc" },
      take: 100,
      select: {
        id: true,
        projectCode: true,
        name: true,
        updatedAt: true,
        sites: {
          where: {
            status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] },
            ...(companyProcurement || !principal.employeeId
              ? {}
              : {
                  OR: [
                    {
                      assignments: {
                        some: {
                          employeeId: principal.employeeId,
                          isActive: true,
                        },
                      },
                    },
                    {
                      project: {
                        assignments: {
                          some: {
                            employeeId: principal.employeeId,
                            isActive: true,
                          },
                        },
                      },
                    },
                    { id: { in: explicitSiteIds } },
                  ],
                }),
          },
          orderBy: { name: "asc" },
          select: { id: true, siteCode: true, name: true, updatedAt: true },
        },
      },
    }),
    db.material.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        materialCode: true,
        name: true,
        updatedAt: true,
        defaultUnit: {
          select: { id: true, code: true, name: true, symbol: true },
        },
      },
    }),
  ]);

  const projectIds = projects.map((project) => project.id);
  const siteIds = projects.flatMap((project) =>
    project.sites.map((site) => site.id),
  );
  const [locations, purchaseOrders, movementReferences] = await Promise.all([
    db.inventoryLocation.findMany({
      where: {
        isActive: true,
        OR: [
          { id: { in: explicitLocationIds } },
          { projectId: { in: projectIds } },
          { siteId: { in: siteIds } },
        ],
      },
      orderBy: { name: "asc" },
      take: 200,
      select: {
        id: true,
        locationCode: true,
        name: true,
        type: true,
        projectId: true,
        siteId: true,
        updatedAt: true,
      },
    }),
    db.purchaseOrder.findMany({
      where: {
        status: { in: ["ISSUED", "ACCEPTED", "PARTIALLY_RECEIVED"] },
        ...(companyProcurement
          ? {}
          : { rfq: { requirement: { projectId: { in: projectIds } } } }),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        poNumber: true,
        status: true,
        expectedDeliveryDate: true,
        updatedAt: true,
        rfq: { select: { requirement: { select: { projectId: true } } } },
      },
    }),
    db.customerStockMovement.findMany({
      where: {
        status: { in: ["REQUESTED", "APPROVED", "DISPATCHED"] },
        OR: [
          {
            source: {
              OR: [
                { projectId: { in: projectIds } },
                { siteId: { in: siteIds } },
              ],
            },
          },
          {
            destination: {
              OR: [
                { projectId: { in: projectIds } },
                { siteId: { in: siteIds } },
              ],
            },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        sourceLocationId: true,
        destinationLocationId: true,
        materialId: true,
        quantity: true,
        updatedAt: true,
      },
    }),
  ]);

  const fetchedAt = new Date();
  const versionSource = JSON.stringify({
    userId: principal.userId,
    projects: projects.map((item) => [item.id, item.updatedAt]),
    materials: materials.map((item) => [item.id, item.updatedAt]),
    locations: locations.map((item) => [item.id, item.updatedAt]),
    purchaseOrders: purchaseOrders.map((item) => [item.id, item.updatedAt]),
    movementReferences: movementReferences.map((item) => [
      item.id,
      item.updatedAt,
    ]),
  });
  const version = createHash("sha256")
    .update(versionSource)
    .digest("hex")
    .slice(0, 32);
  return {
    version,
    fetchedAt: fetchedAt.toISOString(),
    expiresAt: new Date(
      fetchedAt.valueOf() + OFFLINE_REFERENCE_MAX_AGE_MS,
    ).toISOString(),
    permissionScope: {
      userId: principal.userId,
      employeeId: principal.employeeId,
      roles: principal.roleCodes.filter((role) => supportedRoles.has(role)),
      projectIds,
      siteIds,
      locationIds: locations.map((location) => location.id),
    },
    projects: projects.map((project) => ({
      id: project.id,
      projectCode: project.projectCode,
      name: project.name,
      sites: project.sites.map((site) => ({
        id: site.id,
        siteCode: site.siteCode,
        name: site.name,
      })),
    })),
    materials: materials.map((material) => ({
      id: material.id,
      materialCode: material.materialCode,
      name: material.name,
      defaultUnit: material.defaultUnit,
    })),
    locations: locations.map((location) => ({
      id: location.id,
      locationCode: location.locationCode,
      name: location.name,
      type: location.type,
      projectId: location.projectId,
      siteId: location.siteId,
    })),
    purchaseOrders: purchaseOrders.map((order) => ({
      id: order.id,
      poNumber: order.poNumber,
      status: order.status,
      projectId: order.rfq.requirement.projectId,
      expectedDeliveryDate: order.expectedDeliveryDate.toISOString(),
    })),
    movementReferences: movementReferences.map((movement) => ({
      id: movement.id,
      number: movement.number,
      kind: movement.kind,
      status: movement.status,
      sourceLocationId: movement.sourceLocationId,
      destinationLocationId: movement.destinationLocationId,
      materialId: movement.materialId,
      quantity: movement.quantity.toString(),
    })),
  };
}
