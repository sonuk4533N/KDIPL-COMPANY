"use server";

import { revalidatePath } from "next/cache";

import {
  materialIssueCancelSchema,
  materialIssueDraftSchema,
  materialIssueIdSchema,
} from "@/features/inventory/material-issue-schemas";
import { MaterialIssueService } from "@/features/inventory/material-issue-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type MaterialIssueActionState = CommandResult<{ id: string }> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function revalidateInventory() {
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function createMaterialIssueDraftAction(
  _previous: MaterialIssueActionState,
  formData: FormData,
): Promise<MaterialIssueActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.issue");
    const parsed = materialIssueDraftSchema.safeParse({
      sourceLocationId: optionalValue(formData.get("sourceLocationId")),
      materialId: optionalValue(formData.get("materialId")),
      unitId: optionalValue(formData.get("unitId")),
      siteId: optionalValue(formData.get("siteId")),
      quantity: optionalValue(formData.get("quantity")),
      purpose: optionalValue(formData.get("purpose")),
      notes: optionalValue(formData.get("notes")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Review the material, quantity, destination, and purpose.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await MaterialIssueService.createDraft(
      principal,
      parsed.data,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

async function parseIssueId(formData: FormData) {
  return materialIssueIdSchema.safeParse({
    materialIssueId: optionalValue(formData.get("materialIssueId")),
  });
}

export async function postMaterialIssueAction(
  _previous: MaterialIssueActionState,
  formData: FormData,
): Promise<MaterialIssueActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.issue");
    const parsed = await parseIssueId(formData);
    if (!parsed.success)
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid material issue." },
      };
    const result = await MaterialIssueService.post(
      principal,
      parsed.data.materialIssueId,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function acknowledgeMaterialIssueAction(
  _previous: MaterialIssueActionState,
  formData: FormData,
): Promise<MaterialIssueActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.issue");
    const parsed = await parseIssueId(formData);
    if (!parsed.success)
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid material issue." },
      };
    const result = await MaterialIssueService.acknowledge(
      principal,
      parsed.data.materialIssueId,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function cancelMaterialIssueDraftAction(
  _previous: MaterialIssueActionState,
  formData: FormData,
): Promise<MaterialIssueActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "inventory.issue");
    const parsed = materialIssueCancelSchema.safeParse({
      materialIssueId: optionalValue(formData.get("materialIssueId")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a valid material issue and cancellation reason.",
        },
      };
    const result = await MaterialIssueService.cancelDraft(
      principal,
      parsed.data,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
