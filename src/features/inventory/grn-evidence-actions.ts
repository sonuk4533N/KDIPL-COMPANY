"use server";

import { revalidatePath } from "next/cache";

import {
  grnEvidenceSchema,
  siteAcknowledgmentSchema,
} from "@/features/inventory/grn-evidence-schemas";
import { GrnEvidenceService } from "@/features/inventory/grn-evidence-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type GrnEvidenceActionState = CommandResult<{ id: string }> | null;

function revalidateInventory() {
  revalidatePath("/inventory");
  revalidatePath("/procurement");
  revalidatePath("/dashboard");
}

export async function attachGrnEvidenceAction(
  _previous: GrnEvidenceActionState,
  formData: FormData,
): Promise<GrnEvidenceActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    const parsed = grnEvidenceSchema.safeParse({
      goodsReceiptId: formData.get("goodsReceiptId"),
      documentType: formData.get("documentType"),
    });
    const file = formData.get("file");
    if (!parsed.success || !(file instanceof File) || file.size === 0) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Select a valid evidence type and file.",
        },
      };
    }
    const result = await GrnEvidenceService.attach(principal, {
      ...parsed.data,
      file,
    });
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function acknowledgeSiteReceiptAction(
  _previous: GrnEvidenceActionState,
  formData: FormData,
): Promise<GrnEvidenceActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    const parsed = siteAcknowledgmentSchema.safeParse({
      goodsReceiptId: formData.get("goodsReceiptId"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid GRN." },
      };
    }
    const result = await GrnEvidenceService.acknowledgeSiteReceipt(
      principal,
      parsed.data.goodsReceiptId,
    );
    revalidateInventory();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
