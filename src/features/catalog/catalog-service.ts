import "server-only";

import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import type {
  CategoryInput,
  ClientInput,
  MaterialInput,
  SupplierInput,
  UnitInput,
} from "@/features/catalog/catalog-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";

export const CatalogService = {
  async saveClient(principal: AuthenticatedPrincipal, input: ClientInput) {
    return db.$transaction(async (transaction) => {
      const before = input.clientId
        ? await transaction.client.findUnique({ where: { id: input.clientId } })
        : null;
      if (input.clientId && !before) throw new AppError("NOT_FOUND");
      const values = {
        clientCode: input.clientCode,
        name: input.name,
        address: input.address,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        phone: input.phone,
        email: input.email,
      };
      const client = before
        ? await transaction.client.update({
            where: { id: before.id },
            data: values,
          })
        : await transaction.client.create({ data: values });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "Client",
          entityId: client.id,
          before,
          after: client,
        },
        transaction,
      );
      return { id: client.id };
    });
  },

  async saveCategory(principal: AuthenticatedPrincipal, input: CategoryInput) {
    return db.$transaction(async (transaction) => {
      const before = input.categoryId
        ? await transaction.materialCategory.findUnique({
            where: { id: input.categoryId },
          })
        : null;
      if (input.categoryId && !before) throw new AppError("NOT_FOUND");
      const values = {
        code: input.code,
        name: input.name,
        description: input.description,
      };
      const category = before
        ? await transaction.materialCategory.update({
            where: { id: before.id },
            data: values,
          })
        : await transaction.materialCategory.create({ data: values });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "MaterialCategory",
          entityId: category.id,
          before,
          after: category,
        },
        transaction,
      );
      return { id: category.id };
    });
  },

  async saveUnit(principal: AuthenticatedPrincipal, input: UnitInput) {
    return db.$transaction(async (transaction) => {
      const before = input.unitId
        ? await transaction.unitOfMeasure.findUnique({
            where: { id: input.unitId },
          })
        : null;
      if (input.unitId && !before) throw new AppError("NOT_FOUND");
      const values = {
        code: input.code,
        name: input.name,
        symbol: input.symbol,
        description: input.description,
        decimalScale: input.decimalScale,
      };
      const unit = before
        ? await transaction.unitOfMeasure.update({
            where: { id: before.id },
            data: values,
          })
        : await transaction.unitOfMeasure.create({ data: values });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "UnitOfMeasure",
          entityId: unit.id,
          before,
          after: unit,
        },
        transaction,
      );
      return { id: unit.id };
    });
  },

  async saveMaterial(principal: AuthenticatedPrincipal, input: MaterialInput) {
    return db.$transaction(async (transaction) => {
      const before = input.materialId
        ? await transaction.material.findUnique({
            where: { id: input.materialId },
          })
        : null;
      if (input.materialId && !before) throw new AppError("NOT_FOUND");
      const [category, unit] = await Promise.all([
        transaction.materialCategory.findUnique({
          where: { id: input.categoryId },
          select: { id: true, isActive: true },
        }),
        transaction.unitOfMeasure.findUnique({
          where: { id: input.defaultUnitId },
          select: { id: true, isActive: true },
        }),
      ]);
      if (
        !category ||
        (!category.isActive && before?.categoryId !== category.id)
      )
        throw new AppError("VALIDATION_ERROR", "Select an active category.");
      if (!unit || (!unit.isActive && before?.defaultUnitId !== unit.id))
        throw new AppError("VALIDATION_ERROR", "Select an active unit.");
      const values = {
        materialCode: input.materialCode,
        name: input.name,
        description: input.description,
        categoryId: input.categoryId,
        defaultUnitId: input.defaultUnitId,
        minimumStockLevel: input.minimumStockLevel.toString(),
        reorderLevel: input.reorderLevel.toString(),
      };
      const material = before
        ? await transaction.material.update({
            where: { id: before.id },
            data: values,
          })
        : await transaction.material.create({ data: values });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "Material",
          entityId: material.id,
          before: before
            ? {
                ...before,
                minimumStockLevel: before.minimumStockLevel.toString(),
                reorderLevel: before.reorderLevel.toString(),
              }
            : undefined,
          after: {
            ...material,
            minimumStockLevel: material.minimumStockLevel.toString(),
            reorderLevel: material.reorderLevel.toString(),
          },
        },
        transaction,
      );
      return { id: material.id };
    });
  },

  async saveSupplier(principal: AuthenticatedPrincipal, input: SupplierInput) {
    return db.$transaction(async (transaction) => {
      const before = input.supplierId
        ? await transaction.supplier.findUnique({
            where: { id: input.supplierId },
          })
        : null;
      if (input.supplierId && !before) throw new AppError("NOT_FOUND");
      const values = {
        supplierCode: input.supplierCode,
        legalName: input.legalName,
        tradeName: input.tradeName,
        gstin: input.isGstRegistered ? input.gstin : null,
        address: input.address,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        phone: input.phone,
        email: input.email,
        isGstRegistered: input.isGstRegistered,
      };
      const supplier = before
        ? await transaction.supplier.update({
            where: { id: before.id },
            data: values,
          })
        : await transaction.supplier.create({ data: values });
      if (input.contactName) {
        const primary = await transaction.supplierContact.findFirst({
          where: { supplierId: supplier.id, isActive: true, isPrimary: true },
          orderBy: { createdAt: "asc" },
        });
        await transaction.supplierContact.updateMany({
          where: { supplierId: supplier.id, isPrimary: true },
          data: { isPrimary: false },
        });
        const contactValues = {
          name: input.contactName,
          designation: input.contactDesignation,
          phone: input.contactPhone,
          email: input.contactEmail,
          isPrimary: true,
          isActive: true,
        };
        if (primary)
          await transaction.supplierContact.update({
            where: { id: primary.id },
            data: contactValues,
          });
        else
          await transaction.supplierContact.create({
            data: { supplierId: supplier.id, ...contactValues },
          });
      }
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "Supplier",
          entityId: supplier.id,
          before,
          after: { ...supplier, primaryContact: input.contactName ?? null },
        },
        transaction,
      );
      return { id: supplier.id };
    });
  },

  async toggleStatus(
    principal: AuthenticatedPrincipal,
    kind: "client" | "category" | "unit" | "material" | "supplier",
    id: string,
  ) {
    return db.$transaction(async (transaction) => {
      let before: { id: string; isActive: boolean } | null;
      if (kind === "client")
        before = await transaction.client.findUnique({
          where: { id },
          select: { id: true, isActive: true },
        });
      else if (kind === "category")
        before = await transaction.materialCategory.findUnique({
          where: { id },
          select: { id: true, isActive: true },
        });
      else if (kind === "unit")
        before = await transaction.unitOfMeasure.findUnique({
          where: { id },
          select: { id: true, isActive: true },
        });
      else if (kind === "material")
        before = await transaction.material.findUnique({
          where: { id },
          select: { id: true, isActive: true },
        });
      else
        before = await transaction.supplier.findUnique({
          where: { id },
          select: { id: true, isActive: true },
        });
      if (!before) throw new AppError("NOT_FOUND");
      const data = { isActive: !before.isActive };
      let result: { id: string; isActive: boolean };
      if (kind === "client")
        result = await transaction.client.update({
          where: { id },
          data,
          select: { id: true, isActive: true },
        });
      else if (kind === "category")
        result = await transaction.materialCategory.update({
          where: { id },
          data,
          select: { id: true, isActive: true },
        });
      else if (kind === "unit")
        result = await transaction.unitOfMeasure.update({
          where: { id },
          data,
          select: { id: true, isActive: true },
        });
      else if (kind === "material")
        result = await transaction.material.update({
          where: { id },
          data,
          select: { id: true, isActive: true },
        });
      else
        result = await transaction.supplier.update({
          where: { id },
          data,
          select: { id: true, isActive: true },
        });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: {
            client: "Client",
            category: "MaterialCategory",
            unit: "UnitOfMeasure",
            material: "Material",
            supplier: "Supplier",
          }[kind],
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive: result.isActive },
        },
        transaction,
      );
      return { id, isActive: result.isActive };
    });
  },
};
