"use server";

import { revalidatePath } from "next/cache";

import {
  createPurchaseOrderAmendmentSchema,
  decidePurchaseOrderAmendmentSchema,
} from "@/features/inventory/purchase-order-amendment-schemas";
import { PurchaseOrderAmendmentService } from "@/features/inventory/purchase-order-amendment-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type PurchaseOrderAmendmentActionState = CommandResult<{
  id: string;
}> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function revalidateProcurement() {
  revalidatePath("/procurement");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function createPurchaseOrderAmendmentAction(
  _previous: PurchaseOrderAmendmentActionState,
  formData: FormData,
): Promise<PurchaseOrderAmendmentActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.create");
    const lineIds = formData.getAll("purchaseOrderLineId");
    const quantities = formData.getAll("quantity");
    const prices = formData.getAll("unitPrice");
    const parsed = createPurchaseOrderAmendmentSchema.safeParse({
      purchaseOrderId: optionalValue(formData.get("purchaseOrderId")),
      reason: optionalValue(formData.get("reason")),
      expectedDeliveryDate: optionalValue(formData.get("expectedDeliveryDate")),
      paymentTerms: optionalValue(formData.get("paymentTerms")),
      freightAmount: optionalValue(formData.get("freightAmount")),
      lines: lineIds.map((purchaseOrderLineId, index) => ({
        purchaseOrderLineId,
        quantity: quantities[index],
        unitPrice: prices[index],
      })),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Review all PO amendment fields.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await PurchaseOrderAmendmentService.createAndSubmit(
      principal,
      parsed.data,
    );
    revalidateProcurement();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function decidePurchaseOrderAmendmentAction(
  _previous: PurchaseOrderAmendmentActionState,
  formData: FormData,
): Promise<PurchaseOrderAmendmentActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.approve");
    const parsed = decidePurchaseOrderAmendmentSchema.safeParse({
      amendmentId: optionalValue(formData.get("amendmentId")),
      decision: optionalValue(formData.get("decision")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a valid amendment decision and rejection reason.",
        },
      };
    }
    const result = await PurchaseOrderAmendmentService.decide(
      principal,
      parsed.data,
    );
    revalidateProcurement();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
