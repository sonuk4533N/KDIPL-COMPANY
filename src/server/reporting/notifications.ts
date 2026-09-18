import "server-only";

import { db } from "@/db/prisma";
import { Prisma } from "@/generated/prisma/client";

type Alert = {
  eventType: string;
  entityType: string;
  entityId: string;
  recipientRole: string;
  payload: Record<string, string | number>;
};

// Provider-neutral producer for an external scheduler/worker. Delivery remains
// behind the IN_APP/WHATSAPP adapter contract; no provider or credential is
// selected here.
export async function enqueueReportingAlerts(now = new Date()) {
  const olderThan24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const olderThan48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const negativeDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const [
    requirements,
    recommendations,
    overdueOrders,
    negative,
    damaged,
    failedPayments,
    failedTally,
    lowStock,
    blockedClosures,
  ] = await Promise.all([
    db.materialRequirement.findMany({
      where: { status: "SUBMITTED", submittedAt: { lte: olderThan24h } },
      select: { id: true, requirementNumber: true, submittedAt: true },
    }),
    db.requestForQuotation.findMany({
      where: { status: "RECOMMENDED", recommendedAt: { lte: olderThan24h } },
      select: { id: true, rfqNumber: true, recommendedAt: true },
    }),
    db.purchaseOrder.findMany({
      where: {
        status: { in: ["ISSUED", "ACCEPTED", "PARTIALLY_RECEIVED"] },
        expectedDeliveryDate: { lt: now },
      },
      select: { id: true, poNumber: true, expectedDeliveryDate: true },
    }),
    db.temporaryNegativeStockException.findMany({
      where: { status: "OPEN", resolutionDueAt: { lte: negativeDeadline } },
      select: { id: true, deficitQuantity: true, resolutionDueAt: true },
    }),
    db.goodsReceiptException.findMany({
      where: { status: { not: "RESOLVED" } },
      select: { id: true, type: true, quantity: true, createdAt: true },
    }),
    db.supplierPayment.findMany({
      where: { status: "FAILED" },
      select: { id: true, paymentNumber: true, amount: true },
    }),
    db.tallyExportEvent.findMany({
      where: { status: "FAILED" },
      select: { id: true, exportNumber: true, lastError: true },
    }),
    db.$queryRaw<
      Array<{
        id: string;
        projectId: string;
        locationId: string;
        materialId: string;
        quantity: Prisma.Decimal;
        reorderLevel: Prisma.Decimal;
      }>
    >`
        SELECT s.id, s."projectId", s."locationId", s."materialId", COALESCE(b.quantity,0) AS quantity, s."reorderLevel"
        FROM "LowStockSetting" s LEFT JOIN "reporting_stock_balance" b
          ON b."locationId"=s."locationId" AND b."materialId"=s."materialId"
        WHERE COALESCE(b.quantity,0) <= s."reorderLevel"`,
    db.$queryRaw<
      Array<{ projectId: string; projectCode: string; stockKeys: bigint }>
    >`
        SELECT p.id AS "projectId", p."projectCode", COUNT(*) AS "stockKeys"
        FROM "Project" p JOIN "InventoryLocation" l ON l."projectId"=p.id
        JOIN "InventoryStockBalance" b ON b."locationId"=l.id AND b."quantityOnHand"<>0
        WHERE p.status='COMPLETED' GROUP BY p.id, p."projectCode"`,
  ]);
  const alerts: Alert[] = [
    ...requirements.map((row) => ({
      eventType:
        row.submittedAt && row.submittedAt <= olderThan48h
          ? "APPROVAL_ESCALATED_48H"
          : "APPROVAL_OLDER_THAN_24H",
      entityType: "MATERIAL_REQUIREMENT",
      entityId: row.id,
      recipientRole: "PROJECT_MANAGER",
      payload: { number: row.requirementNumber },
    })),
    ...recommendations.map((row) => ({
      eventType:
        row.recommendedAt && row.recommendedAt <= olderThan48h
          ? "APPROVAL_ESCALATED_48H"
          : "APPROVAL_OLDER_THAN_24H",
      entityType: "RFQ",
      entityId: row.id,
      recipientRole: "PROJECT_DIRECTOR",
      payload: { number: row.rfqNumber },
    })),
    ...overdueOrders.map((row) => ({
      eventType: "SUPPLIER_DELIVERY_OVERDUE",
      entityType: "PURCHASE_ORDER",
      entityId: row.id,
      recipientRole: "PURCHASE_MANAGER",
      payload: {
        number: row.poNumber,
        expectedDeliveryDate: row.expectedDeliveryDate
          .toISOString()
          .slice(0, 10),
      },
    })),
    ...negative.map((row) => ({
      eventType:
        row.resolutionDueAt <= now
          ? "NEGATIVE_STOCK_DEADLINE_EXCEEDED"
          : "NEGATIVE_STOCK_DEADLINE_NEAR",
      entityType: "NEGATIVE_STOCK_EXCEPTION",
      entityId: row.id,
      recipientRole: "STORE_KEEPER",
      payload: {
        deficit: row.deficitQuantity.toString(),
        resolutionDueAt: row.resolutionDueAt.toISOString(),
      },
    })),
    ...damaged.map((row) => ({
      eventType: "DAMAGED_REJECTED_UNRESOLVED",
      entityType: "GOODS_RECEIPT_EXCEPTION",
      entityId: row.id,
      recipientRole: "PURCHASE_MANAGER",
      payload: {
        type: row.type,
        quantity: row.quantity.toString(),
        openSince: row.createdAt.toISOString(),
      },
    })),
    ...failedPayments.map((row) => ({
      eventType: "SUPPLIER_PAYMENT_FAILED",
      entityType: "SUPPLIER_PAYMENT",
      entityId: row.id,
      recipientRole: "ACCOUNTS",
      payload: { number: row.paymentNumber, amount: row.amount.toString() },
    })),
    ...failedTally.map((row) => ({
      eventType: "TALLY_EXPORT_FAILED",
      entityType: "TALLY_EXPORT",
      entityId: row.id,
      recipientRole: "ACCOUNTS",
      payload: {
        number: row.exportNumber,
        error: row.lastError ?? "Unavailable",
      },
    })),
    ...lowStock.map((row) => ({
      eventType: "PROJECT_LOW_STOCK",
      entityType: "LOW_STOCK_SETTING",
      entityId: row.id,
      recipientRole: "PROJECT_MANAGER",
      payload: {
        projectId: row.projectId,
        locationId: row.locationId,
        materialId: row.materialId,
        quantity: row.quantity.toString(),
        reorderLevel: row.reorderLevel.toString(),
      },
    })),
    ...blockedClosures.map((row) => ({
      eventType: "PROJECT_UNABLE_TO_CLOSE",
      entityType: "PROJECT",
      entityId: row.projectId,
      recipientRole: "PROJECT_MANAGER",
      payload: {
        projectCode: row.projectCode,
        stockKeys: Number(row.stockKeys),
      },
    })),
  ];
  const day = now.toISOString().slice(0, 10);
  for (const alert of alerts)
    await db.notificationOutbox.upsert({
      where: { dedupeKey: `${alert.eventType}:${alert.entityId}:${day}` },
      update: {},
      create: {
        dedupeKey: `${alert.eventType}:${alert.entityId}:${day}`,
        ...alert,
        channels: ["IN_APP", "WHATSAPP"],
        remindAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        escalateAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      },
    });
  return alerts.length;
}
