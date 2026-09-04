import "server-only";

import { db } from "@/db/prisma";
import { requirePermission } from "@/server/authorization/authorization";
import type { AuthenticatedPrincipal } from "@/types/application";

const receivableStatuses = new Set(["ACCEPTED", "PARTIALLY_RECEIVED"]);

export async function getInventoryWorkspace(principal: AuthenticatedPrincipal) {
  requirePermission(principal, "inventory.view");

  const [locations, purchaseOrders, goodsReceipts, stockBalances, exceptions] =
    await Promise.all([
      db.inventoryLocation.findMany({
        where: { isActive: true },
        orderBy: [{ type: "asc" }, { name: "asc" }],
        include: {
          project: { select: { projectCode: true, name: true } },
          site: { select: { siteCode: true, name: true } },
        },
      }),
      db.purchaseOrder.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          supplier: { select: { legalName: true, tradeName: true } },
          rfq: {
            select: {
              requirement: {
                select: {
                  project: { select: { projectCode: true, name: true } },
                  site: { select: { siteCode: true, name: true } },
                },
              },
            },
          },
          lines: {
            orderBy: { position: "asc" },
            include: {
              requirementLine: {
                select: {
                  material: { select: { materialCode: true, name: true } },
                },
              },
              unit: { select: { symbol: true } },
            },
          },
        },
      }),
      db.goodsReceipt.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          purchaseOrder: { select: { poNumber: true } },
          location: { select: { locationCode: true, name: true } },
          createdBy: { select: { displayName: true } },
          postedBy: { select: { displayName: true } },
          lines: {
            include: {
              material: { select: { materialCode: true, name: true } },
              unit: { select: { symbol: true } },
            },
          },
        },
      }),
      db.$queryRaw<
        Array<{
          locationId: string;
          locationCode: string;
          locationName: string;
          materialId: string;
          materialCode: string;
          materialName: string;
          unitSymbol: string;
          quantityOnHand: string;
        }>
      >`
        SELECT
          b."locationId",
          l."locationCode",
          l."name" AS "locationName",
          b."materialId",
          m."materialCode",
          m."name" AS "materialName",
          u."symbol" AS "unitSymbol",
          b."quantityOnHand"::text AS "quantityOnHand"
        FROM "InventoryStockBalance" b
        JOIN "InventoryLocation" l ON l."id" = b."locationId"
        JOIN "Material" m ON m."id" = b."materialId"
        JOIN "UnitOfMeasure" u ON u."id" = b."unitId"
        WHERE b."quantityOnHand" <> 0
        ORDER BY l."name", m."name"
      `,
      db.$queryRaw<
        Array<{
          id: string;
          type: string;
          status: string;
          quantity: string;
          reason: string | null;
          evidenceReference: string | null;
          resolutionNotes: string | null;
          grnNumber: string;
          poNumber: string;
          materialCode: string;
          materialName: string;
          unitSymbol: string;
          locationCode: string;
          locationName: string;
          createdAt: Date;
        }>
      >`
        SELECT
          e."id",
          e."type"::text AS "type",
          e."status"::text AS "status",
          e."quantity"::text AS "quantity",
          e."reason",
          e."evidenceReference",
          e."resolutionNotes",
          g."grnNumber",
          po."poNumber",
          m."materialCode",
          m."name" AS "materialName",
          u."symbol" AS "unitSymbol",
          loc."locationCode",
          loc."name" AS "locationName",
          e."createdAt"
        FROM "GoodsReceiptException" e
        JOIN "GoodsReceiptLine" line ON line."id" = e."goodsReceiptLineId"
        JOIN "GoodsReceipt" g ON g."id" = line."goodsReceiptId"
        JOIN "PurchaseOrder" po ON po."id" = g."purchaseOrderId"
        JOIN "Material" m ON m."id" = line."materialId"
        JOIN "UnitOfMeasure" u ON u."id" = line."unitId"
        JOIN "InventoryLocation" loc ON loc."id" = g."locationId"
        ORDER BY e."createdAt" DESC
        LIMIT 100
      `,
    ]);

  const receivablePurchaseOrders = purchaseOrders
    .filter((po) => receivableStatuses.has(String(po.status)))
    .map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      status: String(po.status),
      supplierName: po.supplier.tradeName ?? po.supplier.legalName,
      project: po.rfq.requirement.project,
      site: po.rfq.requirement.site,
      lines: po.lines.map((line) => ({
        id: line.id,
        quantity: line.quantity.toString(),
        material: line.requirementLine.material,
        unit: line.unit,
      })),
    }));

  return {
    locations: locations.map((location) => ({
      id: location.id,
      locationCode: location.locationCode,
      name: location.name,
      type: location.type,
      project: location.project,
      site: location.site,
    })),
    purchaseOrders: receivablePurchaseOrders,
    goodsReceipts: goodsReceipts.map((receipt) => ({
      id: receipt.id,
      grnNumber: receipt.grnNumber,
      status: String(receipt.status),
      purchaseOrderId: receipt.purchaseOrderId,
      poNumber: receipt.purchaseOrder.poNumber,
      locationId: receipt.locationId,
      location: receipt.location,
      supplierDeliveryNote: receipt.supplierDeliveryNote,
      supplierDeliveryNoteDate:
        receipt.supplierDeliveryNoteDate?.toISOString().slice(0, 10) ?? null,
      vehicleNumber: receipt.vehicleNumber,
      transporter: receipt.transporter,
      notes: receipt.notes,
      createdBy: receipt.createdBy.displayName,
      postedBy: receipt.postedBy?.displayName ?? null,
      receivedAt: receipt.receivedAt?.toISOString() ?? null,
      createdAt: receipt.createdAt.toISOString(),
      lines: receipt.lines.map((line) => ({
        id: line.id,
        purchaseOrderLineId: line.purchaseOrderLineId,
        material: line.material,
        unit: line.unit,
        orderedQuantity: line.orderedQuantity.toString(),
        acceptedQuantity: line.acceptedQuantity.toString(),
        damagedQuantity: line.damagedQuantity.toString(),
        rejectedQuantity: line.rejectedQuantity.toString(),
        notes: line.notes,
      })),
      totals: receipt.lines.reduce(
        (totals, line) => ({
          accepted: totals.accepted + Number(line.acceptedQuantity),
          damaged: totals.damaged + Number(line.damagedQuantity),
          rejected: totals.rejected + Number(line.rejectedQuantity),
        }),
        { accepted: 0, damaged: 0, rejected: 0 },
      ),
    })),
    stockBalances,
    exceptions: exceptions.map((exception) => ({
      ...exception,
      createdAt: exception.createdAt.toISOString(),
    })),
  };
}

export type InventoryWorkspace = Awaited<
  ReturnType<typeof getInventoryWorkspace>
>;
