"use server";

import { revalidatePath } from "next/cache";

import {
  stockAdjustmentCancelSchema,
  stockAdjustmentDecisionSchema,
  stockAdjustmentDraftSchema,
  stockAdjustmentIdSchema,
} from "@/features/inventory/stock-adjustment-schemas";
import { StockAdjustmentService } from "@/features/inventory/stock-adjustment-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type StockAdjustmentActionState = CommandResult<{ id: string }> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function refresh() {
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/approvals");
}

export async function createStockAdjustmentDraftAction(
  _previous: StockAdjustmentActionState,
  formData: FormData,
): Promise<StockAdjustmentActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.adjust");
    const parsed = stockAdjustmentDraftSchema.safeParse({
      locationId: optionalValue(formData.get("locationId")),
      materialId: optionalValue(formData.get("materialId")),
      unitId: optionalValue(formData.get("unitId")),
      direction: optionalValue(formData.get("direction")),
      quantity: optionalValue(formData.get("quantity")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Review the location, material, direction, quantity, and reason.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    const result = await StockAdjustmentService.createDraft(
      principal,
      parsed.data,
    );
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

function parseId(formData: FormData) {
  return stockAdjustmentIdSchema.safeParse({
    stockAdjustmentId: optionalValue(formData.get("stockAdjustmentId")),
  });
}

export async function submitStockAdjustmentAction(
  _previous: StockAdjustmentActionState,
  formData: FormData,
): Promise<StockAdjustmentActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.adjust");
    const parsed = parseId(formData);
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid stock adjustment.",
        },
      };
    const result = await StockAdjustmentService.submit(
      principal,
      parsed.data.stockAdjustmentId,
    );
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function decideStockAdjustmentAction(
  _previous: StockAdjustmentActionState,
  formData: FormData,
): Promise<StockAdjustmentActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.adjust");
    const parsed = stockAdjustmentDecisionSchema.safeParse({
      stockAdjustmentId: optionalValue(formData.get("stockAdjustmentId")),
      decision: optionalValue(formData.get("decision")),
      notes: optionalValue(formData.get("notes")),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a decision and supporting notes.",
        },
      };
    const result = await StockAdjustmentService.decide(principal, parsed.data);
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function postStockAdjustmentAction(
  _previous: StockAdjustmentActionState,
  formData: FormData,
): Promise<StockAdjustmentActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.adjust");
    const parsed = parseId(formData);
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid stock adjustment.",
        },
      };
    const result = await StockAdjustmentService.post(
      principal,
      parsed.data.stockAdjustmentId,
    );
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function cancelStockAdjustmentAction(
  _previous: StockAdjustmentActionState,
  formData: FormData,
): Promise<StockAdjustmentActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.adjust");
    const parsed = stockAdjustmentCancelSchema.safeParse({
      stockAdjustmentId: optionalValue(formData.get("stockAdjustmentId")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a valid adjustment and cancellation reason.",
        },
      };
    const result = await StockAdjustmentService.cancel(principal, parsed.data);
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
