"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AuditService } from "@/server/audit/audit-service";
import { requireCurrentPrincipal } from "@/server/auth/current-user";
import { requirePermission } from "@/server/authorization/authorization";
import { exportIdempotencyKey, indianFinancialYear } from "./reporting-domain";

const filterSchema = z.object({
  name: z.string().trim().min(2).max(120),
  reportType: z.string().trim().min(2).max(80),
  financialYear: z
    .string()
    .regex(/^\d{2}-\d{2}$/)
    .optional(),
  projectId: z.string().uuid().optional().or(z.literal("")),
  status: z.string().max(50).optional(),
  from: z.string().date().optional().or(z.literal("")),
  to: z.string().date().optional().or(z.literal("")),
  asOf: z.string().date().optional().or(z.literal("")),
});

export async function saveReportFilter(formData: FormData) {
  const principal = await requireCurrentPrincipal();
  requirePermission(principal, "report.view");
  const parsed = filterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { name, reportType, ...filters } = parsed.data;
  await db.$transaction(async (tx) => {
    const saved = await tx.savedReportFilter.upsert({
      where: {
        userId_name_reportType: { userId: principal.userId, name, reportType },
      },
      create: { userId: principal.userId, name, reportType, filters },
      update: { filters },
    });
    await AuditService.record(
      {
        actorUserId: principal.userId,
        action: "UPDATE",
        entityType: "SavedReportFilter",
        entityId: saved.id,
        reason: "Saved report filters",
        metadata: { reportType },
      },
      tx,
    );
  });
  revalidatePath("/reports");
}

export async function deleteReportFilter(formData: FormData) {
  const principal = await requireCurrentPrincipal();
  requirePermission(principal, "report.view");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await db.$transaction(async (tx) => {
    const removed = await tx.savedReportFilter.deleteMany({
      where: { id: id.data, userId: principal.userId },
    });
    if (removed.count)
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: "UPDATE",
          entityType: "SavedReportFilter",
          entityId: id.data,
          reason: "Deleted saved report filter",
        },
        tx,
      );
  });
  revalidatePath("/reports");
}

const valuationSchema = z.object({
  method: z.enum([
    "MOVING_WEIGHTED_AVERAGE",
    "FIFO",
    "LAST_APPROVED_PURCHASE_RATE",
    "QUANTITY_ONLY",
  ]),
  effectiveFrom: z.string().date(),
  caReference: z.string().trim().max(240).optional(),
});

export async function configureValuationPolicy(formData: FormData) {
  const principal = await requireCurrentPrincipal();
  requirePermission(principal, "tax.manage");
  if (!principal.roleCodes.includes("ACCOUNTS_ADMIN")) return;
  const parsed = valuationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const effectiveFrom = new Date(`${parsed.data.effectiveFrom}T00:00:00.000Z`);
  await db.$transaction(
    async (tx) => {
      await tx.stockValuationPolicy.updateMany({
        where: { effectiveTo: null, effectiveFrom: { lt: effectiveFrom } },
        data: { effectiveTo: new Date(effectiveFrom.getTime() - 86_400_000) },
      });
      const policy = await tx.stockValuationPolicy.upsert({
        where: { effectiveFrom },
        create: {
          ...parsed.data,
          effectiveFrom,
          approvedById: principal.userId,
          createdById: principal.userId,
        },
        update: {
          method: parsed.data.method,
          caReference: parsed.data.caReference,
          approvedById: principal.userId,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: "UPDATE",
          entityType: "StockValuationPolicy",
          entityId: policy.id,
          reason: "CA-approved stock valuation policy configured",
          metadata: {
            method: policy.method,
            effectiveFrom,
            caReference: policy.caReference,
          },
        },
        tx,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}

export async function queueExportJob(input: {
  reportType: string;
  format: string;
  filters: Record<string, string | undefined>;
}) {
  const principal = await requireCurrentPrincipal();
  requirePermission(principal, "report.export");
  const filters = Object.fromEntries(
    Object.entries(input.filters).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const financialYear =
    filters.financialYear || indianFinancialYear(new Date());
  const idempotencyKey = exportIdempotencyKey({
    userId: principal.userId,
    reportType: input.reportType,
    format: input.format,
    filters,
  });
  return db.$transaction(async (tx) => {
    const job = await tx.reportExportJob.upsert({
      where: { idempotencyKey },
      create: {
        requestedById: principal.userId,
        reportType: input.reportType,
        format: input.format,
        filters,
        financialYear,
        idempotencyKey,
      },
      update: {},
    });
    await AuditService.record(
      {
        actorUserId: principal.userId,
        action: "EXPORT",
        entityType: "ReportExportJob",
        entityId: job.id,
        reason: "Report export requested",
        metadata: {
          reportType: input.reportType,
          format: input.format,
          financialYear,
        },
      },
      tx,
    );
    return job;
  });
}
