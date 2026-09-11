"use server";

import { revalidatePath } from "next/cache";

import {
  materialReconciliationCancelSchema,
  materialReconciliationDraftSchema,
  materialReconciliationIdSchema,
} from "@/features/inventory/material-reconciliation-schemas";
import { MaterialReconciliationService } from "@/features/inventory/material-reconciliation-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type MaterialReconciliationActionState = CommandResult<{
  id: string;
}> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function refresh() {
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function createMaterialReconciliationDraftAction(
  _previous: MaterialReconciliationActionState,
  formData: FormData,
): Promise<MaterialReconciliationActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.reconcile");
    const parsed = materialReconciliationDraftSchema.safeParse({
      materialIssueLineId: optionalValue(formData.get("materialIssueLineId")),
      returnLocationId: optionalValue(formData.get("returnLocationId")),
      purpose: optionalValue(formData.get("purpose")),
      consumedQuantity: optionalValue(formData.get("consumedQuantity")) ?? 0,
      returnedQuantity: optionalValue(formData.get("returnedQuantity")) ?? 0,
      wastageQuantity: optionalValue(formData.get("wastageQuantity")) ?? 0,
      scrapQuantity: optionalValue(formData.get("scrapQuantity")) ?? 0,
      notes: optionalValue(formData.get("notes")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Review the issued material, reconciliation quantities, return location, purpose, and notes.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await MaterialReconciliationService.createDraft(
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
  return materialReconciliationIdSchema.safeParse({
    materialReconciliationId: optionalValue(
      formData.get("materialReconciliationId"),
    ),
  });
}

export async function postMaterialReconciliationAction(
  _previous: MaterialReconciliationActionState,
  formData: FormData,
): Promise<MaterialReconciliationActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.reconcile");
    const parsed = parseId(formData);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid material reconciliation.",
        },
      };
    }
    const result = await MaterialReconciliationService.post(
      principal,
      parsed.data.materialReconciliationId,
    );
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function cancelMaterialReconciliationAction(
  _previous: MaterialReconciliationActionState,
  formData: FormData,
): Promise<MaterialReconciliationActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.reconcile");
    const parsed = materialReconciliationCancelSchema.safeParse({
      materialReconciliationId: optionalValue(
        formData.get("materialReconciliationId"),
      ),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a valid reconciliation and cancellation reason.",
        },
      };
    }
    const result = await MaterialReconciliationService.cancelDraft(
      principal,
      parsed.data,
    );
    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
