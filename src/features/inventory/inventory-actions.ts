"use server";

import { revalidatePath } from "next/cache";

import {
  goodsReceiptDraftSchema,
  goodsReceiptIdSchema,
  purchaseOrderAcceptanceSchema,
  purchaseOrderCancelSchema,
  purchaseOrderIdSchema,
} from "@/features/inventory/inventory-schemas";
import { InventoryService } from "@/features/inventory/inventory-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type InventoryActionState = CommandResult<{ id: string }> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function revalidateInventory() {
  revalidatePath("/inventory");
  revalidatePath("/procurement");
  revalidatePath("/dashboard");
}

export async function issuePurchaseOrderAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.create");
    const parsed = purchaseOrderIdSchema.safeParse({
      purchaseOrderId: optionalValue(formData.get("purchaseOrderId")),
    });
    if (!parsed.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid purchase order." } };
    const result = await InventoryService.issuePurchaseOrder(principal, parsed.data.purchaseOrderId);
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function recordSupplierAcceptanceAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.create");
    const parsed = purchaseOrderAcceptanceSchema.safeParse({
      purchaseOrderId: optionalValue(formData.get("purchaseOrderId")),
      supplierAcceptedAt: optionalValue(formData.get("supplierAcceptedAt")),
      supplierAcceptanceReference: optionalValue(formData.get("supplierAcceptanceReference")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Record supplier acceptance date and reference.",
          fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        },
      };
    }
    const result = await InventoryService.recordSupplierAcceptance(principal, parsed.data);
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function cancelPurchaseOrderAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.create");
    const parsed = purchaseOrderCancelSchema.safeParse({
      purchaseOrderId: optionalValue(formData.get("purchaseOrderId")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "Provide a cancellation reason." } };
    }
    const result = await InventoryService.cancelPurchaseOrder(principal, parsed.data);
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function createGoodsReceiptDraftAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.receive");
    const purchaseOrderLineIds = formData.getAll("purchaseOrderLineId");
    const accepted = formData.getAll("acceptedQuantity");
    const damaged = formData.getAll("damagedQuantity");
    const rejected = formData.getAll("rejectedQuantity");
    const lineNotes = formData.getAll("lineNotes");
    const parsed = goodsReceiptDraftSchema.safeParse({
      purchaseOrderId: optionalValue(formData.get("purchaseOrderId")),
      locationId: optionalValue(formData.get("locationId")),
      supplierDeliveryNote: optionalValue(formData.get("supplierDeliveryNote")),
      supplierDeliveryNoteDate: optionalValue(formData.get("supplierDeliveryNoteDate")),
      vehicleNumber: optionalValue(formData.get("vehicleNumber")),
      transporter: optionalValue(formData.get("transporter")),
      receivedAt: optionalValue(formData.get("receivedAt")),
      notes: optionalValue(formData.get("notes")),
      lines: purchaseOrderLineIds.map((purchaseOrderLineId, index) => ({
        purchaseOrderLineId,
        acceptedQuantity: accepted[index] ?? "0",
        damagedQuantity: damaged[index] ?? "0",
        rejectedQuantity: rejected[index] ?? "0",
        notes: typeof lineNotes[index] === "string" && lineNotes[index] ? lineNotes[index] : undefined,
      })),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Review the GRN quantities and receiving details.",
          fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        },
      };
    }
    const result = await InventoryService.createGoodsReceiptDraft(principal, parsed.data);
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function postGoodsReceiptAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.receive");
    const parsed = goodsReceiptIdSchema.safeParse({
      goodsReceiptId: optionalValue(formData.get("goodsReceiptId")),
    });
    if (!parsed.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid GRN." } };
    const result = await InventoryService.postGoodsReceipt(principal, parsed.data.goodsReceiptId);
    revalidateInventory();
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    return toCommandError(error);
  }
}
