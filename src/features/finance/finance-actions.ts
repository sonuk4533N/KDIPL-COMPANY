"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/prisma";
import { AuditService } from "@/server/audit/audit-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { AppError, toCommandError } from "@/server/errors/app-error";
import {
  accountRoles,
  requireFinanceRole,
  requireReason,
} from "@/server/finance/policy";
import { recordTallyAttempt } from "@/server/finance/tally-export";
import {
  retentionUntilForEightFinancialYears,
  scanFileLocally,
} from "@/server/storage/file-security";
import { getStorageProvider, validateUpload } from "@/server/storage/storage";
import type { CommandResult } from "@/types/application";
import {
  SupplierAdvanceService,
  SupplierFinancialNoteService,
} from "./adjustment-service";
import {
  advanceSchema,
  financialNoteSchema,
  invoiceCommandSchema,
  invoiceDraftSchema,
  paymentSchema,
  taxRuleSchema,
} from "./finance-schemas";
import { SupplierInvoiceService } from "./invoice-service";
import { SupplierPaymentService } from "./payment-service";
import { TaxRuleService } from "./tax-service";

export type FinanceActionState = CommandResult<{
  id: string;
  status?: string;
  number?: string;
}> | null;

const command = z.object({
  id: z.uuid(),
  decision: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(1000),
});

function parseJson(form: FormData) {
  const value = form.get("payload");
  if (typeof value !== "string")
    throw new AppError("VALIDATION_ERROR", "Missing form payload.");
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid form payload.");
  }
}

async function uploadFinanceDocument(
  principal: NonNullable<Awaited<ReturnType<typeof getCurrentPrincipal>>>,
  form: FormData,
) {
  const documentType = z
    .enum([
      "SUPPLIER_INVOICE",
      "PAYMENT_PROOF",
      "ADVANCE_PAYMENT_EVIDENCE",
      "CREDIT_NOTE",
      "DEBIT_NOTE",
      "TAX_SUPPORTING_DOCUMENT",
    ])
    .parse(form.get("documentType"));
  const file = form.get("file");
  if (!(file instanceof File))
    throw new AppError("FILE_UPLOAD_ERROR", "Choose a financial document.");
  const upload = {
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    bytes: new Uint8Array(await file.arrayBuffer()),
    documentType,
  };
  validateUpload(upload);
  const stored = await getStorageProvider().put(upload);
  const scan = scanFileLocally(upload.bytes);
  const record = await db.$transaction(async (tx) => {
    await requireFinanceRole(tx, principal, accountRoles);
    const saved = await tx.fileRecord.create({
      data: {
        filename: upload.filename,
        mimeType: upload.mimeType,
        size: BigInt(upload.size),
        storageKey: stored.storageKey,
        storageProvider: stored.provider,
        documentType,
        uploadedById: principal.userId,
        scanStatus: scan.status === "CLEAN" ? "CLEAN" : "QUARANTINED",
        scanProvider: scan.provider,
        scanReference: scan.reference,
        scannedAt: new Date(),
        retentionUntil: retentionUntilForEightFinancialYears(new Date()),
      },
    });
    await AuditService.record(
      {
        actorUserId: principal.userId,
        action: scan.status === "CLEAN" ? "CREATE" : "REJECT",
        entityType: "FinanceDocument",
        entityId: saved.id,
        after: {
          filename: saved.filename,
          documentType,
          scanStatus: saved.scanStatus,
        },
      },
      tx,
    );
    return saved;
  });
  if (record.scanStatus !== "CLEAN")
    throw new AppError(
      "FILE_UPLOAD_ERROR",
      "The file was quarantined after its security scan.",
    );
  return { id: record.id };
}

export async function financeAction(
  _previous: FinanceActionState,
  form: FormData,
): Promise<FinanceActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    if (!principal) throw new AppError("UNAUTHORIZED");
    const operation = z.string().parse(form.get("operation"));
    let result: { id: string; status?: string; number?: string };
    if (operation === "upload")
      result = await uploadFinanceDocument(principal, form);
    else if (operation === "invoice_create")
      result = await SupplierInvoiceService.createDraft(
        principal,
        invoiceDraftSchema.parse(parseJson(form)),
      );
    else if (operation === "invoice_command")
      result = await SupplierInvoiceService.command(
        principal,
        invoiceCommandSchema.parse(parseJson(form)),
      );
    else if (operation === "payment_prepare")
      result = await SupplierPaymentService.prepare(
        principal,
        paymentSchema.parse(parseJson(form)),
      );
    else if (operation === "payment_decide") {
      const input = command.parse(Object.fromEntries(form));
      result = await SupplierPaymentService.decide(
        principal,
        input.id,
        z.enum(["APPROVE", "REJECT", "FAIL"]).parse(input.decision),
        input.reason,
      );
    } else if (operation === "payment_reversal") {
      const input = z
        .object({
          id: z.uuid(),
          proofDocumentId: z.uuid(),
          reason: z.string().trim().min(3).max(1000),
        })
        .parse(Object.fromEntries(form));
      result = await SupplierPaymentService.prepareReversal(
        principal,
        input.id,
        input.proofDocumentId,
        input.reason,
      );
    } else if (operation === "payment_clearance") {
      const input = z
        .object({
          id: z.uuid(),
          clearanceStatus: z.enum(["CLEARED", "BOUNCED"]),
          reason: z.string().trim().min(3).max(1000),
        })
        .parse(Object.fromEntries(form));
      result = await SupplierPaymentService.updateChequeClearance(
        principal,
        input.id,
        input.clearanceStatus,
        input.reason,
      );
    } else if (operation === "advance_create")
      result = await SupplierAdvanceService.create(
        principal,
        advanceSchema.parse(parseJson(form)),
      );
    else if (operation === "advance_decide") {
      const input = command.parse(Object.fromEntries(form));
      result = await SupplierAdvanceService.decide(
        principal,
        input.id,
        z.enum(["APPROVE", "REJECT"]).parse(input.decision),
        input.reason,
      );
    } else if (operation === "advance_apply") {
      const input = z
        .object({
          id: z.uuid(),
          invoiceId: z.uuid(),
          amount: z.string(),
          reason: z.string().trim().min(3),
        })
        .parse(Object.fromEntries(form));
      result = await SupplierAdvanceService.apply(
        principal,
        input.id,
        input.invoiceId,
        input.amount,
        input.reason,
      );
    } else if (operation === "advance_settle") {
      const input = z
        .object({
          id: z.uuid(),
          decision: z.enum(["REFUND", "REVERSE"]),
          evidenceDocumentId: z.uuid(),
          reason: z.string().trim().min(3).max(1000),
        })
        .parse(Object.fromEntries(form));
      result = await SupplierAdvanceService.settle(
        principal,
        input.id,
        input.decision,
        input.evidenceDocumentId,
        input.reason,
      );
    } else if (operation === "note_create")
      result = await SupplierFinancialNoteService.create(
        principal,
        financialNoteSchema.parse(parseJson(form)),
      );
    else if (operation === "note_command") {
      const input = command.parse(Object.fromEntries(form));
      result =
        input.decision === "SUBMIT"
          ? await SupplierFinancialNoteService.submit(
              principal,
              input.id,
              input.reason,
            )
          : await SupplierFinancialNoteService.decide(
              principal,
              input.id,
              z.enum(["APPROVE", "REJECT"]).parse(input.decision),
              input.reason,
            );
    } else if (operation === "exception_resolve") {
      const input = z
        .object({
          id: z.uuid(),
          resolutionType: z.enum(["REPLACEMENT", "CREDIT_NOTE", "DEBIT_NOTE"]),
          resolutionId: z.uuid(),
          reason: z.string().trim().min(3).max(1000),
        })
        .parse(Object.fromEntries(form));
      result = await SupplierFinancialNoteService.resolveReceiptException(
        principal,
        input.id,
        input.resolutionType,
        input.resolutionId,
        input.reason,
      );
    } else if (operation === "tax_create")
      result = await TaxRuleService.createVersion(
        principal,
        taxRuleSchema.parse(Object.fromEntries(form)),
      );
    else if (operation === "tally_process") {
      const input = command.parse(Object.fromEntries(form));
      result = await db.$transaction(async (tx) => {
        await requireFinanceRole(tx, principal, accountRoles);
        const event = await tx.tallyExportEvent.findUniqueOrThrow({
          where: { id: input.id },
        });
        if (event.status === "FAILED")
          await tx.tallyExportEvent.update({
            where: { id: event.id },
            data: { status: "RETRY_PENDING" },
          });
        const processed = await recordTallyAttempt(tx, event.id, { ok: true });
        await AuditService.record(
          {
            actorUserId: principal.userId,
            action: "UPDATE",
            entityType: "TallyExportEvent",
            entityId: event.id,
            before: { status: event.status },
            after: { status: processed.status, checksum: processed.checksum },
            reason: requireReason(input.reason, "TALLY_EXPORT"),
          },
          tx,
        );
        return { id: processed.id, status: processed.status };
      });
    } else throw new AppError("VALIDATION_ERROR", "Unknown finance operation.");
    revalidatePath("/accounts");
    revalidatePath("/approvals");
    revalidatePath("/reports");
    revalidatePath("/notifications");
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
      };
    return toCommandError(error);
  }
}
