import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { db } from "@/db/prisma";
import { hasPermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";

const supplierSelection = {
  id: true,
  supplierCode: true,
  legalName: true,
  tradeName: true,
  gstin: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  phone: true,
  email: true,
  isGstRegistered: true,
  isActive: true,
  contacts: {
    where: { isActive: true },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      designation: true,
      phone: true,
      email: true,
      isPrimary: true,
    },
  },
} satisfies Prisma.SupplierSelect;

export async function getCatalogWorkspace(principal: AuthenticatedPrincipal) {
  const canViewCatalog = hasPermission(principal, "catalog.view");
  const canViewSuppliers = hasPermission(principal, "supplier.view");
  if (!canViewCatalog && !canViewSuppliers) throw new AppError("FORBIDDEN");

  const [clients, categories, units, materials, suppliers] = await Promise.all([
    canViewCatalog
      ? db.client.findMany({
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          select: {
            id: true,
            clientCode: true,
            name: true,
            address: true,
            city: true,
            state: true,
            postalCode: true,
            phone: true,
            email: true,
            isActive: true,
            _count: { select: { projects: true } },
          },
        })
      : [],
    canViewCatalog
      ? db.materialCategory.findMany({
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            isActive: true,
            _count: { select: { materials: true } },
          },
        })
      : [],
    canViewCatalog
      ? db.unitOfMeasure.findMany({
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true,
            description: true,
            decimalScale: true,
            isActive: true,
            _count: { select: { materials: true } },
          },
        })
      : [],
    canViewCatalog
      ? db.material.findMany({
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          select: {
            id: true,
            materialCode: true,
            name: true,
            description: true,
            categoryId: true,
            defaultUnitId: true,
            minimumStockLevel: true,
            reorderLevel: true,
            isActive: true,
            category: { select: { name: true, isActive: true } },
            defaultUnit: {
              select: { name: true, symbol: true, isActive: true },
            },
          },
        })
      : [],
    canViewSuppliers
      ? db.supplier.findMany({
          orderBy: [{ isActive: "desc" }, { legalName: "asc" }],
          select: supplierSelection,
        })
      : [],
  ]);

  return {
    clients,
    categories,
    units,
    materials: materials.map((material) => ({
      ...material,
      minimumStockLevel: material.minimumStockLevel.toString(),
      reorderLevel: material.reorderLevel.toString(),
    })),
    suppliers,
  };
}

export async function getSupplierDetail(
  principal: AuthenticatedPrincipal,
  supplierId: string,
) {
  if (!hasPermission(principal, "supplier.view"))
    throw new AppError("FORBIDDEN");
  return db.supplier.findUnique({
    where: { id: supplierId },
    select: supplierSelection,
  });
}

export type CatalogWorkspace = Awaited<ReturnType<typeof getCatalogWorkspace>>;
export type SupplierDetail = NonNullable<
  Awaited<ReturnType<typeof getSupplierDetail>>
>;
