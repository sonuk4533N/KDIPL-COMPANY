"use server";

import { revalidatePath } from "next/cache";

import {
  requirementDecisionSchema,
  requirementDraftSchema,
  requirementSubmitSchema,
} from "@/features/requirements/requirement-schemas";
import { RequirementService } from "@/features/requirements/requirement-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type RequirementActionState = CommandResult<{ id: string }> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function revalidateRequirement(id: string) {
  revalidatePath("/requirements");
  revalidatePath(`/requirements/${id}`);
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}

export async function saveRequirementDraftAction(
  _previous: RequirementActionState,
  formData: FormData,
): Promise<RequirementActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "material_requirement.create");
    const materialIds = formData.getAll("materialId");
    const quantities = formData.getAll("quantity");
    const lineNotes = formData.getAll("lineNotes");
    const parsed = requirementDraftSchema.safeParse({
      requirementId: optionalValue(formData.get("requirementId")),
      projectId: optionalValue(formData.get("projectId")),
      siteId: optionalValue(formData.get("siteId")),
      neededBy: optionalValue(formData.get("neededBy")),
      purpose: optionalValue(formData.get("purpose")),
      notes: optionalValue(formData.get("notes")),
      lines: materialIds.map((materialId, index) => ({
        materialId,
        quantity: quantities[index],
        notes: optionalValue(lineNotes[index] ?? null),
      })),
    });
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the draft requirement.",
          fields: flattened.fieldErrors as Record<string, string[]>,
        },
      };
    }
    const result = await RequirementService.saveDraft(principal, parsed.data);
    revalidateRequirement(result.id);
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function submitRequirementAction(
  _previous: RequirementActionState,
  formData: FormData,
): Promise<RequirementActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "material_requirement.create");
    const parsed = requirementSubmitSchema.safeParse({
      requirementId: optionalValue(formData.get("requirementId")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Select a valid requirement to submit.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await RequirementService.submit(principal, parsed.data);
    revalidateRequirement(result.id);
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function decideRequirementAction(
  _previous: RequirementActionState,
  formData: FormData,
): Promise<RequirementActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "material_requirement.approve");
    const parsed = requirementDecisionSchema.safeParse({
      requirementId: optionalValue(formData.get("requirementId")),
      decision: optionalValue(formData.get("decision")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Review the approval decision.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await RequirementService.decide(principal, parsed.data);
    revalidateRequirement(result.id);
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
