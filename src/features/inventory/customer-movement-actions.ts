"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/prisma";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { AppError, toCommandError } from "@/server/errors/app-error";
import { AuditService } from "@/server/audit/audit-service";
import { getStorageProvider, validateUpload } from "@/server/storage/storage";
import {
  retentionUntilForEightFinancialYears,
  scanFileLocally,
} from "@/server/storage/file-security";
import {
  CustomerMovementService,
  requireCustomerRole,
} from "./customer-movement-service";
import {
  movementCreateSchema,
  movementTransitionSchema,
} from "./customer-movement-schemas";
import { ProjectStockClosureService } from "./project-stock-closure-service";
import type { CommandResult } from "@/types/application";

export type CustomerMovementActionState = CommandResult<{ id: string }> | null;
export async function customerMovementAction(
  _previous: CustomerMovementActionState,
  form: FormData,
): Promise<CustomerMovementActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    if (!principal) throw new AppError("UNAUTHORIZED");
    const raw = Object.fromEntries(form);
    const operation = form.get("operation");
    let result: { id: string };
    if (operation === "create")
      result = await CustomerMovementService.create(
        principal,
        movementCreateSchema.parse(raw),
      );
    else if (operation === "transition")
      result = await CustomerMovementService.transition(
        principal,
        movementTransitionSchema.parse(raw),
      );
    else if (operation === "start_closure" || operation === "close_project") {
      const input = z
        .object({
          projectId: z.uuid(),
          centralLocationId: z.string().optional(),
          reason: z.string().trim().min(3).max(1000),
        })
        .parse(raw);
      result =
        operation === "start_closure"
          ? await ProjectStockClosureService.synchronize(
              principal,
              input.projectId,
              z.uuid().parse(input.centralLocationId),
              input.reason,
            )
          : await ProjectStockClosureService.close(
              principal,
              input.projectId,
              input.reason,
            );
    } else if (operation === "upload") {
      await db.$transaction((tx) =>
        requireCustomerRole(
          tx,
          principal,
          principal.roleCodes.includes("STORE_KEEPER")
            ? "STORE_KEEPER"
            : "SITE_SUPERVISOR",
        ),
      );
      const file = form.get("file");
      if (!(file instanceof File))
        throw new AppError("FILE_UPLOAD_ERROR", "Choose evidence to upload.");
      const upload = {
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        bytes: new Uint8Array(await file.arrayBuffer()),
        documentType: "STOCK_MOVEMENT_EVIDENCE",
      };
      validateUpload(upload);
      const storage = getStorageProvider();
      const stored = await storage.put(upload);
      const scan = scanFileLocally(upload.bytes);
      result = await db.$transaction(async (tx) => {
        const record = await tx.fileRecord.create({
          data: {
            filename: upload.filename,
            mimeType: upload.mimeType,
            size: BigInt(upload.size),
            storageKey: stored.storageKey,
            storageProvider: stored.provider,
            documentType: upload.documentType,
            uploadedById: principal.userId,
            scanStatus: scan.status,
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
            entityType: "CustomerMovementEvidence",
            entityId: record.id,
            after: { scanStatus: scan.status, filename: record.filename },
          },
          tx,
        );
        return { id: record.id };
      });
      if (scan.status !== "CLEAN")
        throw new AppError(
          "FILE_UPLOAD_ERROR",
          "Evidence failed its security scan and cannot be attached.",
        );
    } else
      throw new AppError("VALIDATION_ERROR", "Unknown movement operation.");
    revalidatePath("/inventory/movements");
    revalidatePath("/inventory");
    revalidatePath("/projects");
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
