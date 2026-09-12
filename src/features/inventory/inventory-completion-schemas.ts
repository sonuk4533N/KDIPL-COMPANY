import { z } from "zod";

const uuid = z.string().uuid();
const quantity = z.coerce.number().finite().min(0);
const optionalCoordinate = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().finite().optional(),
);
const checkbox = z.preprocess(
  (value) => value === "on" || value === "true" || value === true,
  z.boolean(),
);

export const closePurchaseOrderSchema = z.object({
  purchaseOrderId: uuid,
  shortCloseReason: z.string().trim().min(3).max(1000).optional(),
});

export const cancelGoodsReceiptSchema = z.object({
  goodsReceiptId: uuid,
  reason: z.string().trim().min(3).max(1000),
});

export const updateGoodsReceiptDraftSchema = z.object({
  goodsReceiptId: uuid,
  locationId: uuid,
  supplierDeliveryNote: z.string().trim().max(100).optional(),
  supplierDeliveryNoteDate: z.string().optional(),
  vehicleNumber: z.string().trim().max(50).optional(),
  transporter: z.string().trim().max(160).optional(),
  directSiteDelivery: checkbox.default(false),
  gpsLatitude: optionalCoordinate,
  gpsLongitude: optionalCoordinate,
  gpsCapturedAt: z.string().optional(),
  receiverName: z.string().trim().max(160).optional(),
  receivedAt: z.string().min(1),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        goodsReceiptLineId: uuid,
        acceptedQuantity: quantity,
        damagedQuantity: quantity,
        rejectedQuantity: quantity,
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1),
});

export const updateGoodsReceiptExceptionSchema = z.object({
  exceptionId: uuid,
  status: z.enum([
    "OPEN",
    "REPLACEMENT_EXPECTED",
    "RETURN_PENDING",
    "RETURNED",
    "RESOLVED",
  ]),
  evidenceReference: z.string().trim().max(500).optional(),
  resolutionNotes: z.string().trim().max(1000).optional(),
});

export type UpdateGoodsReceiptDraftInput = z.infer<
  typeof updateGoodsReceiptDraftSchema
>;
export type UpdateGoodsReceiptExceptionInput = z.infer<
  typeof updateGoodsReceiptExceptionSchema
>;
