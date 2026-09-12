"use server";

import { revalidatePath } from "next/cache";

import {
  rfqCancelSchema,
  rfqDecisionSchema,
  rfqDraftSchema,
  rfqIdSchema,
  rfqRecommendationSchema,
  supplierQuotationSchema,
} from "@/features/procurement/rfq-schemas";
import {
  RfqService,
  type StoredQuotationDocument,
} from "@/features/procurement/rfq-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { toCommandError } from "@/server/errors/app-error";
import {
  retentionUntilForEightFinancialYears,
  scanFileLocally,
} from "@/server/storage/file-security";
import { getStorageProvider } from "@/server/storage/storage";
import type { CommandResult } from "@/types/application";

export type RfqActionState = CommandResult<{ id: string }> | null;

function optionalValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function revalidateProcurement(rfqId?: string) {
  revalidatePath("/procurement");
  if (rfqId) revalidatePath(`/procurement/rfqs/${rfqId}`);
  revalidatePath("/dashboard");
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
    revalidateProcurement();
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function issueRfqAction(
  _previous: RfqActionState,
  formData: FormData,
): Promise<RfqActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.create");
    const parsed = rfqIdSchema.safeParse({
      rfqId: optionalValue(formData.get("rfqId")),
    });
    if (!parsed.success) throw new Error("Invalid RFQ identifier.");
    const result = await RfqService.issue(principal, parsed.data.rfqId);
    revalidateProcurement(result.id);
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function recordSupplierQuotationAction(
  _previous: RfqActionState,
  formData: FormData,
): Promise<RfqActionState> {
  let stored: StoredQuotationDocument | undefined;
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.create");
    const requirementLineIds = formData.getAll("requirementLineId");
    const unitPrices = formData.getAll("unitPrice");
    const parsed = supplierQuotationSchema.safeParse({
      rfqId: optionalValue(formData.get("rfqId")),
      supplierId: optionalValue(formData.get("supplierId")),
      quoteReference: optionalValue(formData.get("quoteReference")),
      quoteDate: optionalValue(formData.get("quoteDate")),
      validUntil: optionalValue(formData.get("validUntil")),
      offeredDeliveryDate: optionalValue(formData.get("offeredDeliveryDate")),
      paymentTerms: optionalValue(formData.get("paymentTerms")),
      gstRate: optionalValue(formData.get("gstRate")),
      freightAmount: optionalValue(formData.get("freightAmount")),
      notes: optionalValue(formData.get("notes")),
      linePrices: requirementLineIds.map((requirementLineId, index) => ({
        requirementLineId,
        unitPrice: unitPrices[index],
      })),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the supplier quotation.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const file = formData.get("document");
    if (!(file instanceof File) || file.size === 0) {
      return {
        ok: false,
        error: {
          code: "FILE_UPLOAD_ERROR",
          message: "Attach the supplier quotation PDF or image.",
          fields: { document: ["A supporting document is required."] },
        },
      };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const scan = scanFileLocally(bytes);
    if (scan.status !== "CLEAN") {
      return {
        ok: false,
        error: {
          code: "FILE_UPLOAD_ERROR",
          message: "The quotation document failed its security scan.",
        },
      };
    }
    const provider = getStorageProvider();
    const storedObject = await provider.put({
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      bytes,
      documentType: "SUPPLIER_QUOTATION",
    });
    stored = {
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      storageKey: storedObject.storageKey,
      storageProvider: storedObject.provider,
      scanProvider: scan.provider,
      scanReference: scan.reference,
      scannedAt: new Date(),
      retentionUntil: retentionUntilForEightFinancialYears(new Date()),
    };
    const result = await RfqService.recordQuotation(
      principal,
      parsed.data,
      stored,
    );
    stored = undefined;
    revalidateProcurement(result.rfqId);
    return { ok: true, data: { id: result.rfqId } };
  } catch (error) {
    if (stored) {
      await getStorageProvider()
        .delete(stored.storageKey)
        .catch(() => undefined);
    }
    return toCommandError(error);
  }
}

export async function recommendQuotationAction(
  _previous: RfqActionState,
  formData: FormData,
): Promise<RfqActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.create");
    const parsed = rfqRecommendationSchema.safeParse({
      rfqId: optionalValue(formData.get("rfqId")),
      quotationId: optionalValue(formData.get("quotationId")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Select a quotation and provide a recommendation reason.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await RfqService.recommend(principal, parsed.data);
    revalidateProcurement(result.id);
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function decideRfqAction(
  _previous: RfqActionState,
  formData: FormData,
): Promise<RfqActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.approve");
    const parsed = rfqDecisionSchema.safeParse({
      rfqId: optionalValue(formData.get("rfqId")),
      decision: optionalValue(formData.get("decision")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Review the RFQ decision.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await RfqService.decide(principal, parsed.data);
    revalidateProcurement(result.id);
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function cancelRfqAction(
  _previous: RfqActionState,
  formData: FormData,
): Promise<RfqActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "purchase.create");
    const parsed = rfqCancelSchema.safeParse({
      rfqId: optionalValue(formData.get("rfqId")),
      reason: optionalValue(formData.get("reason")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a cancellation reason.",
          fields: parsed.error.flatten().fieldErrors as Record<
            string,
            string[]
          >,
        },
      };
    }
    const result = await RfqService.cancel(principal, parsed.data);
    revalidateProcurement(result.id);
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}
