"use server";

import { revalidatePath } from "next/cache";

import {
  cancelGoodsReceiptSchema,
  closePurchaseOrderSchema,
  updateGoodsReceiptDraftSchema,
  updateGoodsReceiptExceptionSchema,
} from "@/features/inventory/inventory-completion-schemas";
import { InventoryCompletionService } from "@/features/inventory/inventory-completion-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type InventoryCompletionActionState = CommandResult<{
  id: string;
}> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function revalidateInventory() {
  revalidatePath("/inventory");
  revalidatePath("/procurement");
  revalidatePath("/dashboard");
}

export async function closePurchaseOrderAction(
  _previous: InventoryCompletionActionState,
  formData: FormData,
): Promise<InventoryCompletionActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    const parsed = closePurchaseOrderSchema.safeParse({
      purchaseOrderId: optionalValue(formData.get("purchaseOrderId")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid purchase order." },
      };
    }
    const result = await InventoryCompletionService.closePurchaseOrder(
      principal,
      parsed.data.purchaseOrderId,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function cancelGoodsReceiptAction(
  _previous: InventoryCompletionActionState,
  formData: FormData,
): Promise<InventoryCompletionActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    const parsed = cancelGoodsReceiptSchema.safeParse({
      goodsReceiptId: optionalValue(formData.get("goodsReceiptId")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a valid GRN and cancellation reason.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await InventoryCompletionService.cancelGoodsReceiptDraft(
      principal,
      parsed.data.goodsReceiptId,
      parsed.data.reason,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function updateGoodsReceiptDraftAction(
  _previous: InventoryCompletionActionState,
  formData: FormData,
): Promise<InventoryCompletionActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    const lineIds = formData.getAll("goodsReceiptLineId");
    const accepted = formData.getAll("acceptedQuantity");
    const damaged = formData.getAll("damagedQuantity");
    const rejected = formData.getAll("rejectedQuantity");
    const notes = formData.getAll("lineNotes");
    const parsed = updateGoodsReceiptDraftSchema.safeParse({
      goodsReceiptId: optionalValue(formData.get("goodsReceiptId")),
      locationId: optionalValue(formData.get("locationId")),
      supplierDeliveryNote: optionalValue(formData.get("supplierDeliveryNote")),
      supplierDeliveryNoteDate: optionalValue(
        formData.get("supplierDeliveryNoteDate"),
      ),
      vehicleNumber: optionalValue(formData.get("vehicleNumber")),
      transporter: optionalValue(formData.get("transporter")),
      receivedAt: optionalValue(formData.get("receivedAt")),
      notes: optionalValue(formData.get("notes")),
      lines: lineIds.map((goodsReceiptLineId, index) => ({
        goodsReceiptLineId,
        acceptedQuantity: accepted[index] ?? "0",
        damagedQuantity: damaged[index] ?? "0",
        rejectedQuantity: rejected[index] ?? "0",
        notes:
          typeof notes[index] === "string" && notes[index]
            ? notes[index]
            : undefined,
      })),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Review the GRN draft details and quantities.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await InventoryCompletionService.updateGoodsReceiptDraft(
      principal,
      parsed.data,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function updateGoodsReceiptExceptionAction(
  _previous: InventoryCompletionActionState,
  formData: FormData,
): Promise<InventoryCompletionActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    const parsed = updateGoodsReceiptExceptionSchema.safeParse({
      exceptionId: optionalValue(formData.get("exceptionId")),
      status: optionalValue(formData.get("status")),
      evidenceReference: optionalValue(formData.get("evidenceReference")),
      resolutionNotes: optionalValue(formData.get("resolutionNotes")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Review the exception status and evidence details.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await InventoryCompletionService.updateGoodsReceiptException(
      principal,
      parsed.data,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
