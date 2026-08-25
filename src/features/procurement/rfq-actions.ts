"use server";

import { revalidatePath } from "next/cache";

import { rfqDraftSchema } from "@/features/procurement/rfq-schemas";
import { RfqService } from "@/features/procurement/rfq-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type RfqActionState = CommandResult<{ id: string }> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function saveRfqDraftAction(
  _previous: RfqActionState,
  formData: FormData,
): Promise<RfqActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.create");
    const parsed = rfqDraftSchema.safeParse({
      rfqId: optionalValue(formData.get("rfqId")),
      requirementId: optionalValue(formData.get("requirementId")),
      responseDueDate: optionalValue(formData.get("responseDueDate")),
      supplierIds: formData.getAll("supplierId"),
      notes: optionalValue(formData.get("notes")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the RFQ draft.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await RfqService.saveDraft(principal, parsed.data);
    revalidatePath("/procurement");
    revalidatePath("/dashboard");
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
