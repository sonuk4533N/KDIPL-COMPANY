"use server";

import { revalidatePath } from "next/cache";
import {
  stockCountCancelSchema,
  stockCountDecisionSchema,
  stockCountDraftSchema,
  stockCountIdSchema,
} from "@/features/inventory/stock-count-schemas";
import { StockCountService } from "@/features/inventory/stock-count-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type StockCountActionState = CommandResult<{ id: string }> | null;
const optionalValue = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const refresh = () => {
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/approvals");
};

export async function createStockCountDraftAction(
  _previous: StockCountActionState,
  formData: FormData,
): Promise<StockCountActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.count");
    const parsed = stockCountDraftSchema.safeParse({
      locationId: optionalValue(formData.get("locationId")),
      materialId: optionalValue(formData.get("materialId")),
      unitId: optionalValue(formData.get("unitId")),
      countedAt: optionalValue(formData.get("countedAt")),
      countedQuantity: optionalValue(formData.get("countedQuantity")),
      notes: optionalValue(formData.get("notes")),
      lineNotes: optionalValue(formData.get("lineNotes")),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Review the location, material, count time, and counted quantity.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    const result = await StockCountService.createDraft(principal, parsed.data);
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

function parseId(formData: FormData) {
  return stockCountIdSchema.safeParse({
    stockCountId: optionalValue(formData.get("stockCountId")),
  });
}

export async function submitStockCountAction(
  _previous: StockCountActionState,
  formData: FormData,
): Promise<StockCountActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.count");
    const parsed = parseId(formData);
    if (!parsed.success)
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid physical count." },
      };
    const result = await StockCountService.submit(
      principal,
      parsed.data.stockCountId,
    );
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function decideStockCountAction(
  _previous: StockCountActionState,
  formData: FormData,
): Promise<StockCountActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.count");
    const parsed = stockCountDecisionSchema.safeParse({
      stockCountId: optionalValue(formData.get("stockCountId")),
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
    const result = await StockCountService.decide(principal, parsed.data);
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function postStockCountAction(
  _previous: StockCountActionState,
  formData: FormData,
): Promise<StockCountActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.count");
    const parsed = parseId(formData);
    if (!parsed.success)
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid physical count." },
      };
    const result = await StockCountService.post(
      principal,
      parsed.data.stockCountId,
    );
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function cancelStockCountAction(
  _previous: StockCountActionState,
  formData: FormData,
): Promise<StockCountActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.count");
    const parsed = stockCountCancelSchema.safeParse({
      stockCountId: optionalValue(formData.get("stockCountId")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a valid count and cancellation reason.",
        },
      };
    const result = await StockCountService.cancel(principal, parsed.data);
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
