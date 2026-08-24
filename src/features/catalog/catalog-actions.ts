"use server";

import { revalidatePath } from "next/cache";

import {
  categorySchema,
  clientSchema,
  materialSchema,
  supplierSchema,
  unitSchema,
} from "@/features/catalog/catalog-schemas";
import { CatalogService } from "@/features/catalog/catalog-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError, toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type CatalogActionState = CommandResult<{
  id?: string;
  isActive?: boolean;
}> | null;

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function validationError(
  message: string,
  fields: Record<string, string[] | undefined>,
): CatalogActionState {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message,
      fields: Object.fromEntries(
        Object.entries(fields).filter((entry): entry is [string, string[]] =>
          Boolean(entry[1]?.length),
        ),
      ),
    },
  };
}

async function mutationPrincipal(
  permission: "catalog.manage" | "supplier.manage",
) {
  await validateMutationOrigin();
  const principal = await getCurrentPrincipal();
  requirePermission(principal, permission);
  return principal;
}

export async function saveClientAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  try {
    const principal = await mutationPrincipal("catalog.manage");
    const parsed = clientSchema.safeParse({
      clientId: formValue(formData, "clientId"),
      clientCode: formValue(formData, "clientCode"),
      name: formValue(formData, "name"),
      address: formValue(formData, "address"),
      city: formValue(formData, "city"),
      state: formValue(formData, "state"),
      postalCode: formValue(formData, "postalCode"),
      phone: formValue(formData, "phone"),
      email: formValue(formData, "email"),
    });
    if (!parsed.success)
      return validationError(
        "Please review the client information.",
        parsed.error.flatten().fieldErrors,
      );
    const result = await CatalogService.saveClient(principal, parsed.data);
    revalidatePath("/master-data");
    revalidatePath("/projects");
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function saveCategoryAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  try {
    const principal = await mutationPrincipal("catalog.manage");
    const parsed = categorySchema.safeParse({
      categoryId: formValue(formData, "categoryId"),
      code: formValue(formData, "code"),
      name: formValue(formData, "name"),
      description: formValue(formData, "description"),
    });
    if (!parsed.success)
      return validationError(
        "Please review the category information.",
        parsed.error.flatten().fieldErrors,
      );
    const result = await CatalogService.saveCategory(principal, parsed.data);
    revalidatePath("/master-data");
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function saveUnitAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  try {
    const principal = await mutationPrincipal("catalog.manage");
    const parsed = unitSchema.safeParse({
      unitId: formValue(formData, "unitId"),
      code: formValue(formData, "code"),
      name: formValue(formData, "name"),
      symbol: formValue(formData, "symbol"),
      description: formValue(formData, "description"),
      decimalScale: formValue(formData, "decimalScale"),
    });
    if (!parsed.success)
      return validationError(
        "Please review the unit information.",
        parsed.error.flatten().fieldErrors,
      );
    const result = await CatalogService.saveUnit(principal, parsed.data);
    revalidatePath("/master-data");
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function saveMaterialAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  try {
    const principal = await mutationPrincipal("catalog.manage");
    const parsed = materialSchema.safeParse({
      materialId: formValue(formData, "materialId"),
      materialCode: formValue(formData, "materialCode"),
      name: formValue(formData, "name"),
      description: formValue(formData, "description"),
      categoryId: formValue(formData, "categoryId"),
      defaultUnitId: formValue(formData, "defaultUnitId"),
      minimumStockLevel: formValue(formData, "minimumStockLevel"),
      reorderLevel: formValue(formData, "reorderLevel"),
    });
    if (!parsed.success)
      return validationError(
        "Please review the material information.",
        parsed.error.flatten().fieldErrors,
      );
    const result = await CatalogService.saveMaterial(principal, parsed.data);
    revalidatePath("/master-data");
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function saveSupplierAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  try {
    const principal = await mutationPrincipal("supplier.manage");
    const parsed = supplierSchema.safeParse({
      supplierId: formValue(formData, "supplierId"),
      supplierCode: formValue(formData, "supplierCode"),
      legalName: formValue(formData, "legalName"),
      tradeName: formValue(formData, "tradeName"),
      gstin: formValue(formData, "gstin"),
      address: formValue(formData, "address"),
      city: formValue(formData, "city"),
      state: formValue(formData, "state"),
      postalCode: formValue(formData, "postalCode"),
      phone: formValue(formData, "phone"),
      email: formValue(formData, "email"),
      isGstRegistered: formData.get("isGstRegistered") === "on",
      contactName: formValue(formData, "contactName"),
      contactDesignation: formValue(formData, "contactDesignation"),
      contactPhone: formValue(formData, "contactPhone"),
      contactEmail: formValue(formData, "contactEmail"),
    });
    if (!parsed.success)
      return validationError(
        "Please review the supplier information.",
        parsed.error.flatten().fieldErrors,
      );
    const result = await CatalogService.saveSupplier(principal, parsed.data);
    revalidatePath("/master-data");
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function toggleCatalogStatusAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  try {
    const kind = formValue(formData, "kind");
    const id = formValue(formData, "id");
    if (
      !id ||
      !kind ||
      !["client", "category", "unit", "material", "supplier"].includes(kind)
    )
      throw new AppError("VALIDATION_ERROR");
    const principal = await mutationPrincipal(
      kind === "supplier" ? "supplier.manage" : "catalog.manage",
    );
    const result = await CatalogService.toggleStatus(
      principal,
      kind as "client" | "category" | "unit" | "material" | "supplier",
      id,
    );
    revalidatePath("/master-data");
    revalidatePath("/projects");
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
