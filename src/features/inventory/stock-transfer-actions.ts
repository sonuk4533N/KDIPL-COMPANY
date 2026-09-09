"use server";

import { revalidatePath } from "next/cache";

import {
  stockTransferCancelSchema,
  stockTransferDraftSchema,
  stockTransferIdSchema,
} from "@/features/inventory/stock-transfer-schemas";
import { StockTransferService } from "@/features/inventory/stock-transfer-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type StockTransferActionState = CommandResult<{ id: string }> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function revalidateInventory() {
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function createStockTransferDraftAction(
  _previous: StockTransferActionState,
  formData: FormData,
): Promise<StockTransferActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.transfer");
    const parsed = stockTransferDraftSchema.safeParse({
      sourceLocationId: optionalValue(formData.get("sourceLocationId")),
      destinationLocationId: optionalValue(
        formData.get("destinationLocationId"),
      ),
      materialId: optionalValue(formData.get("materialId")),
      unitId: optionalValue(formData.get("unitId")),
      quantity: optionalValue(formData.get("quantity")),
      purpose: optionalValue(formData.get("purpose")),
      notes: optionalValue(formData.get("notes")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Review the stock, destination, quantity, and purpose.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await StockTransferService.createDraft(
      principal,
      parsed.data,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

function parseTransferId(formData: FormData) {
  return stockTransferIdSchema.safeParse({
    stockTransferId: optionalValue(formData.get("stockTransferId")),
  });
}

export async function dispatchStockTransferAction(
  _previous: StockTransferActionState,
  formData: FormData,
): Promise<StockTransferActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.transfer");
    const parsed = parseTransferId(formData);
    if (!parsed.success)
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid stock transfer." },
      };
    const result = await StockTransferService.dispatch(
      principal,
      parsed.data.stockTransferId,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function receiveStockTransferAction(
  _previous: StockTransferActionState,
  formData: FormData,
): Promise<StockTransferActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.transfer");
    const parsed = parseTransferId(formData);
    if (!parsed.success)
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid stock transfer." },
      };
    const result = await StockTransferService.receive(
      principal,
      parsed.data.stockTransferId,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function cancelStockTransferDraftAction(
  _previous: StockTransferActionState,
  formData: FormData,
): Promise<StockTransferActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.transfer");
    const parsed = stockTransferCancelSchema.safeParse({
      stockTransferId: optionalValue(formData.get("stockTransferId")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a valid transfer and cancellation reason.",
        },
      };
    const result = await StockTransferService.cancelDraft(
      principal,
      parsed.data,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
