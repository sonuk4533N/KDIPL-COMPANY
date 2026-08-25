import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  AuditAction,
  RequestForQuotationStatus,
  RequestForQuotationWorkflowAction,
} from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import {
  rfqDateInput,
  type RfqCancelInput,
  type RfqDecisionInput,
  type RfqDraftInput,
  type RfqRecommendationInput,
  type SupplierQuotationInput,
} from "@/features/procurement/rfq-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import { TransactionNumberService } from "@/server/transactions/transaction-number-service";
import type { AuthenticatedPrincipal } from "@/types/application";

function procurementRequirementScope(
  principal: AuthenticatedPrincipal,
): Prisma.MaterialRequirementWhereInput {
  if (
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") ||
    principal.roleCodes.includes("PURCHASE_MANAGER")
  ) {
    return {};
  }
  if (!principal.employeeId) {
    return { id: { equals: "00000000-0000-0000-0000-000000000000" } };
  }
  return {
    OR: [
      {
        project: {
          assignments: {
            some: { employeeId: principal.employeeId, isActive: true },
          },
        },
      },
      {
        site: {
          assignments: {
            some: { employeeId: principal.employeeId, isActive: true },
          },
        },
      },
    ],
  };
}

function supplierEvidence(
  suppliers: Array<{ supplierId: string; isActive: boolean }>,
) {
  return suppliers.map(({ supplierId, isActive }) => ({
    supplierId,
    isActive,
  }));
}

export type StoredQuotationDocument = {
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  storageProvider: "LOCAL" | "S3";
};

function requirePurchaseManager(principal: AuthenticatedPrincipal) {
  if (
    !principal.roleCodes.includes("PURCHASE_MANAGER") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only the Purchase Manager can perform this commercial action.",
    );
  }
}

function requireProjectDirectorDecision(
  principal: AuthenticatedPrincipal,
  rfq: { createdById: string; recommendedById: string | null },
) {
  if (
    !principal.roleCodes.includes("PROJECT_DIRECTOR") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") ||
    principal.userId === rfq.createdById ||
    principal.userId === rfq.recommendedById
  ) {
    throw new AppError(
      "FORBIDDEN",
      "A different Project Director must make this decision.",
    );
  }
}

async function addWorkflowEvent(
  transaction: Prisma.TransactionClient,
  values: {
    rfqId: string;
    action: RequestForQuotationWorkflowAction;
    fromStatus: RequestForQuotationStatus;
    toStatus: RequestForQuotationStatus;
    actorUserId: string;
    reason?: string;
  },
) {
  await transaction.requestForQuotationWorkflowEvent.create({ data: values });
  await AuditService.record(
    {
      actorUserId: values.actorUserId,
      action:
        values.action === RequestForQuotationWorkflowAction.RECOMMEND
          ? AuditAction.RECOMMEND
          : AuditAction[values.action],
      entityType: "RequestForQuotation",
      entityId: values.rfqId,
      reason: values.reason,
      before: { status: values.fromStatus },
      after: { status: values.toStatus },
    },
    transaction,
  );
}

export const RfqService = {
  async saveDraft(principal: AuthenticatedPrincipal, input: RfqDraftInput) {
    requirePermission(principal, "purchase.create");
    return db.$transaction(async (transaction) => {
      const before = input.rfqId
        ? await transaction.requestForQuotation.findFirst({
            where: {
              id: input.rfqId,
              requirement: procurementRequirementScope(principal),
            },
            include: { invitedSuppliers: true },
          })
        : null;
      if (input.rfqId && !before) throw new AppError("NOT_FOUND");
      if (before && before.status !== RequestForQuotationStatus.DRAFT) {
        throw new AppError("CONFLICT", "Only draft RFQs can be changed.");
      }
      if (before && before.createdById !== principal.userId) {
        throw new AppError(
          "FORBIDDEN",
          "Only the RFQ creator can change this draft.",
        );
      }
      if (before && before.requirementId !== input.requirementId) {
        throw new AppError(
          "CONFLICT",
          "An RFQ cannot be moved to another material requirement.",
        );
      }

      const requirement = await transaction.materialRequirement.findFirst({
        where: {
          id: input.requirementId,
          status: "APPROVED",
          AND: procurementRequirementScope(principal),
        },
        include: {
          lines: {
            where: { isActive: true },
            orderBy: { position: "asc" },
            select: {
              materialId: true,
              unitId: true,
              quantity: true,
            },
          },
        },
      });
      if (!requirement) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an approved material requirement within your sourcing scope.",
        );
      }
      if (!requirement.lines.length) {
        throw new AppError(
          "CONFLICT",
          "The approved requirement has no active material lines.",
        );
      }

      const existingSupplierIds = new Set(
        before?.invitedSuppliers.map(({ supplierId }) => supplierId) ?? [],
      );
      const suppliers = await transaction.supplier.findMany({
        where: { id: { in: input.supplierIds } },
        select: { id: true, legalName: true, isActive: true },
      });
      if (suppliers.length !== input.supplierIds.length) {
        throw new AppError("VALIDATION_ERROR", "Select valid suppliers.");
      }
      const newlyInactive = suppliers.find(
        ({ id, isActive }) => !isActive && !existingSupplierIds.has(id),
      );
      if (newlyInactive) {
        throw new AppError(
          "VALIDATION_ERROR",
          `${newlyInactive.legalName} is inactive and cannot be added.`,
        );
      }

      const responseDueDate = rfqDateInput(input.responseDueDate);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (responseDueDate < today) {
        throw new AppError(
          "VALIDATION_ERROR",
          "The response due date cannot be in the past.",
          400,
          { responseDueDate: ["Choose today or a future date."] },
        );
      }

      const now = new Date();
      const rfq = before
        ? await transaction.requestForQuotation.update({
            where: { id: before.id },
            data: { responseDueDate, notes: input.notes },
          })
        : await transaction.requestForQuotation.create({
            data: {
              rfqNumber: await TransactionNumberService.next(
                "RFQ",
                now,
                transaction,
              ),
              requirementId: requirement.id,
              responseDueDate,
              notes: input.notes,
              createdById: principal.userId,
            },
          });

      await transaction.requestForQuotationSupplier.updateMany({
        where: {
          rfqId: rfq.id,
          supplierId: { notIn: input.supplierIds },
          isActive: true,
        },
        data: { isActive: false },
      });
      for (const supplierId of input.supplierIds) {
        await transaction.requestForQuotationSupplier.upsert({
          where: { rfqId_supplierId: { rfqId: rfq.id, supplierId } },
          create: { rfqId: rfq.id, supplierId },
          update: { isActive: true },
        });
      }
      const afterSuppliers =
        await transaction.requestForQuotationSupplier.findMany({
          where: { rfqId: rfq.id },
          orderBy: { supplierId: "asc" },
          select: { supplierId: true, isActive: true },
        });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "RequestForQuotation",
          entityId: rfq.id,
          before: before
            ? {
                requirementId: before.requirementId,
                status: before.status,
                responseDueDate: before.responseDueDate,
                notes: before.notes,
                suppliers: supplierEvidence(before.invitedSuppliers),
              }
            : undefined,
          after: {
            rfqNumber: rfq.rfqNumber,
            requirementId: rfq.requirementId,
            status: rfq.status,
            responseDueDate: rfq.responseDueDate,
            notes: rfq.notes,
            requirementLines: requirement.lines.map((line) => ({
              materialId: line.materialId,
              unitId: line.unitId,
              quantity: line.quantity.toString(),
            })),
            suppliers: supplierEvidence(afterSuppliers),
          },
        },
        transaction,
      );
      return { id: rfq.id };
    });
  },

  async issue(principal: AuthenticatedPrincipal, rfqId: string) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);
    return db.$transaction(async (transaction) => {
      const rfq = await transaction.requestForQuotation.findFirst({
        where: {
          id: rfqId,
          requirement: procurementRequirementScope(principal),
        },
        include: {
          invitedSuppliers: {
            where: { isActive: true },
            select: { supplierId: true },
          },
        },
      });
      if (!rfq) throw new AppError("NOT_FOUND");
      if (rfq.status !== RequestForQuotationStatus.DRAFT) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only a draft RFQ can be issued.",
        );
      }
      if (rfq.invitedSuppliers.length < 3) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Select at least three active suppliers before issuing the RFQ.",
        );
      }
      const activeSupplierCount = await transaction.supplier.count({
        where: {
          id: { in: rfq.invitedSuppliers.map(({ supplierId }) => supplierId) },
          isActive: true,
        },
      });
      if (activeSupplierCount !== rfq.invitedSuppliers.length) {
        throw new AppError(
          "CONFLICT",
          "Reactivate or replace inactive suppliers before issue.",
        );
      }
      const now = new Date();
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);
      if (rfq.responseDueDate < today) {
        throw new AppError(
          "CONFLICT",
          "Move the supplier response date forward before issue.",
        );
      }
      const changed = await transaction.requestForQuotation.updateMany({
        where: { id: rfq.id, status: RequestForQuotationStatus.DRAFT },
        data: {
          status: RequestForQuotationStatus.ISSUED,
          issuedById: principal.userId,
          issuedAt: now,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      await addWorkflowEvent(transaction, {
        rfqId: rfq.id,
        action: RequestForQuotationWorkflowAction.ISSUE,
        fromStatus: RequestForQuotationStatus.DRAFT,
        toStatus: RequestForQuotationStatus.ISSUED,
        actorUserId: principal.userId,
      });
      return { id: rfq.id };
    });
  },

  async recordQuotation(
    principal: AuthenticatedPrincipal,
    input: SupplierQuotationInput,
    document: StoredQuotationDocument,
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);
    return db.$transaction(async (transaction) => {
      const rfq = await transaction.requestForQuotation.findFirst({
        where: {
          id: input.rfqId,
          requirement: procurementRequirementScope(principal),
        },
        include: {
          invitedSuppliers: {
            where: { supplierId: input.supplierId, isActive: true },
            select: { supplierId: true },
          },
          requirement: {
            include: {
              lines: {
                where: { isActive: true },
                orderBy: { position: "asc" },
                select: { id: true, unitId: true, quantity: true },
              },
            },
          },
        },
      });
      if (!rfq) throw new AppError("NOT_FOUND");
      if (rfq.status !== RequestForQuotationStatus.ISSUED) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Quotations can be recorded only while the RFQ is issued.",
        );
      }
      if (!rfq.invitedSuppliers.length) {
        throw new AppError(
          "FORBIDDEN",
          "The supplier is not active on this RFQ.",
        );
      }
      const suppliedPrices = new Map(
        input.linePrices.map((line) => [
          line.requirementLineId,
          line.unitPrice,
        ]),
      );
      if (
        suppliedPrices.size !== rfq.requirement.lines.length ||
        rfq.requirement.lines.some(({ id }) => !suppliedPrices.has(id))
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Price every material line in the approved requirement.",
        );
      }
      const pricedLines = rfq.requirement.lines.map((line) => {
        const unitPrice = new Prisma.Decimal(suppliedPrices.get(line.id)!);
        const lineSubtotal = line.quantity.mul(unitPrice).toDecimalPlaces(2);
        return { ...line, unitPrice, lineSubtotal };
      });
      const subtotal = pricedLines.reduce(
        (total, line) => total.add(line.lineSubtotal),
        new Prisma.Decimal(0),
      );
      const gstRate = new Prisma.Decimal(input.gstRate);
      const gstAmount = subtotal.mul(gstRate).div(100).toDecimalPlaces(2);
      const freightAmount = new Prisma.Decimal(input.freightAmount);
      const landedTotal = subtotal.add(gstAmount).add(freightAmount);
      const quotation = await transaction.supplierQuotation.create({
        data: {
          rfqId: rfq.id,
          supplierId: input.supplierId,
          quoteReference: input.quoteReference,
          quoteDate: rfqDateInput(input.quoteDate),
          validUntil: rfqDateInput(input.validUntil),
          offeredDeliveryDate: rfqDateInput(input.offeredDeliveryDate),
          paymentTerms: input.paymentTerms,
          subtotal,
          gstRate,
          gstAmount,
          freightAmount,
          landedTotal,
          notes: input.notes,
          recordedById: principal.userId,
          lines: {
            create: pricedLines.map((line) => ({
              requirementLineId: line.id,
              unitId: line.unitId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineSubtotal: line.lineSubtotal,
            })),
          },
        },
      });
      const fileRecord = await transaction.fileRecord.create({
        data: {
          filename: document.filename,
          mimeType: document.mimeType,
          size: BigInt(document.size),
          storageKey: document.storageKey,
          storageProvider: document.storageProvider,
          documentType: "SUPPLIER_QUOTATION",
          uploadedById: principal.userId,
        },
      });
      await transaction.supplierQuotationDocument.create({
        data: { quotationId: quotation.id, fileRecordId: fileRecord.id },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "SupplierQuotation",
          entityId: quotation.id,
          after: {
            rfqId: rfq.id,
            supplierId: quotation.supplierId,
            quoteReference: quotation.quoteReference,
            subtotal: subtotal.toFixed(2),
            gstRate: gstRate.toFixed(2),
            gstAmount: gstAmount.toFixed(2),
            freightAmount: freightAmount.toFixed(2),
            landedTotal: landedTotal.toFixed(2),
            lineCount: pricedLines.length,
            documentId: fileRecord.id,
          },
        },
        transaction,
      );
      return { id: quotation.id, rfqId: rfq.id };
    });
  },

  async recommend(
    principal: AuthenticatedPrincipal,
    input: RfqRecommendationInput,
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);
    return db.$transaction(async (transaction) => {
      const rfq = await transaction.requestForQuotation.findFirst({
        where: {
          id: input.rfqId,
          requirement: procurementRequirementScope(principal),
        },
        include: {
          quotations: {
            where: { id: input.quotationId },
            include: { documents: { select: { id: true } } },
          },
        },
      });
      if (!rfq) throw new AppError("NOT_FOUND");
      if (rfq.status !== RequestForQuotationStatus.ISSUED) {
        throw new AppError("INVALID_STATUS_TRANSITION");
      }
      const quotation = rfq.quotations[0];
      if (!quotation?.documents.length) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Select a recorded quotation with supporting evidence.",
        );
      }
      const now = new Date();
      const changed = await transaction.requestForQuotation.updateMany({
        where: { id: rfq.id, status: RequestForQuotationStatus.ISSUED },
        data: {
          status: RequestForQuotationStatus.RECOMMENDED,
          recommendedQuotationId: quotation.id,
          recommendedById: principal.userId,
          recommendedAt: now,
          recommendationReason: input.reason,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      await addWorkflowEvent(transaction, {
        rfqId: rfq.id,
        action: RequestForQuotationWorkflowAction.RECOMMEND,
        fromStatus: RequestForQuotationStatus.ISSUED,
        toStatus: RequestForQuotationStatus.RECOMMENDED,
        actorUserId: principal.userId,
        reason: input.reason,
      });
      return { id: rfq.id };
    });
  },

  async decide(principal: AuthenticatedPrincipal, input: RfqDecisionInput) {
    requirePermission(principal, "purchase.approve");
    return db.$transaction(async (transaction) => {
      const rfq = await transaction.requestForQuotation.findFirst({
        where: { id: input.rfqId },
        include: {
          recommendedQuotation: { include: { lines: true } },
        },
      });
      if (!rfq) throw new AppError("NOT_FOUND");
      if (rfq.status !== RequestForQuotationStatus.RECOMMENDED) {
        throw new AppError("INVALID_STATUS_TRANSITION");
      }
      requireProjectDirectorDecision(principal, rfq);
      const quotation = rfq.recommendedQuotation;
      if (!quotation) throw new AppError("CONFLICT");
      const targetStatus =
        input.decision === "APPROVE"
          ? RequestForQuotationStatus.APPROVED
          : input.decision === "REJECT"
            ? RequestForQuotationStatus.REJECTED
            : RequestForQuotationStatus.ISSUED;
      const now = new Date();
      const sentBack = input.decision === "SEND_BACK";
      const changed = await transaction.requestForQuotation.updateMany({
        where: { id: rfq.id, status: RequestForQuotationStatus.RECOMMENDED },
        data: sentBack
          ? {
              status: targetStatus,
              recommendedQuotationId: null,
              recommendedById: null,
              recommendedAt: null,
              recommendationReason: null,
              decidedById: null,
              decidedAt: null,
              decisionReason: null,
            }
          : {
              status: targetStatus,
              decidedById: principal.userId,
              decidedAt: now,
              decisionReason: input.decision === "REJECT" ? input.reason : null,
            },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      let purchaseOrderId: string | undefined;
      if (input.decision === "APPROVE") {
        const po = await transaction.purchaseOrder.create({
          data: {
            poNumber: await TransactionNumberService.next(
              "PO",
              now,
              transaction,
            ),
            rfqId: rfq.id,
            quotationId: quotation.id,
            supplierId: quotation.supplierId,
            currency: quotation.currency,
            subtotal: quotation.subtotal,
            gstRate: quotation.gstRate,
            gstAmount: quotation.gstAmount,
            freightAmount: quotation.freightAmount,
            totalAmount: quotation.landedTotal,
            expectedDeliveryDate: quotation.offeredDeliveryDate,
            paymentTerms: quotation.paymentTerms,
            createdById: principal.userId,
            lines: {
              create: quotation.lines.map((line, position) => ({
                quotationLineId: line.id,
                requirementLineId: line.requirementLineId,
                unitId: line.unitId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineSubtotal: line.lineSubtotal,
                position,
              })),
            },
          },
        });
        purchaseOrderId = po.id;
        await AuditService.record(
          {
            actorUserId: principal.userId,
            action: AuditAction.CREATE,
            entityType: "PurchaseOrder",
            entityId: po.id,
            after: {
              poNumber: po.poNumber,
              rfqId: rfq.id,
              quotationId: quotation.id,
              supplierId: quotation.supplierId,
              status: po.status,
              totalAmount: po.totalAmount.toString(),
            },
          },
          transaction,
        );
      }
      await addWorkflowEvent(transaction, {
        rfqId: rfq.id,
        action: input.decision,
        fromStatus: RequestForQuotationStatus.RECOMMENDED,
        toStatus: targetStatus,
        actorUserId: principal.userId,
        reason: input.reason,
      });
      return { id: rfq.id, purchaseOrderId };
    });
  },

  async cancel(principal: AuthenticatedPrincipal, input: RfqCancelInput) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);
    return db.$transaction(async (transaction) => {
      const rfq = await transaction.requestForQuotation.findFirst({
        where: {
          id: input.rfqId,
          requirement: procurementRequirementScope(principal),
        },
      });
      if (!rfq) throw new AppError("NOT_FOUND");
      if (
        rfq.status !== RequestForQuotationStatus.DRAFT &&
        rfq.status !== RequestForQuotationStatus.ISSUED
      ) {
        throw new AppError("INVALID_STATUS_TRANSITION");
      }
      const now = new Date();
      const changed = await transaction.requestForQuotation.updateMany({
        where: { id: rfq.id, status: rfq.status },
        data: {
          status: RequestForQuotationStatus.CANCELLED,
          decidedById: principal.userId,
          decidedAt: now,
          decisionReason: input.reason,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      await addWorkflowEvent(transaction, {
        rfqId: rfq.id,
        action: RequestForQuotationWorkflowAction.CANCEL,
        fromStatus: rfq.status,
        toStatus: RequestForQuotationStatus.CANCELLED,
        actorUserId: principal.userId,
        reason: input.reason,
      });
      return { id: rfq.id };
    });
  },
};
