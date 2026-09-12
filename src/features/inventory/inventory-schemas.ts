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

export const purchaseOrderIdSchema = z.object({ purchaseOrderId: uuid });

export const purchaseOrderAcceptanceSchema = z.object({
  purchaseOrderId: uuid,
  supplierAcceptedAt: z.string().min(1),
  supplierAcceptanceReference: z.string().trim().min(1).max(100),
});

export const purchaseOrderCancelSchema = z.object({
  purchaseOrderId: uuid,
  reason: z.string().trim().min(3).max(1000),
});

export const goodsReceiptDraftSchema = z.object({
  goodsReceiptId: uuid.optional(),
  purchaseOrderId: uuid,
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
        purchaseOrderLineId: uuid,
        acceptedQuantity: quantity,
        damagedQuantity: quantity,
        rejectedQuantity: quantity,
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1),
}).superRefine((value, context) => {
  if (!value.directSiteDelivery) return;
  if (
    value.gpsLatitude === undefined ||
    value.gpsLatitude < -90 ||
    value.gpsLatitude > 90
  ) {
    context.addIssue({
      code: "custom",
      path: ["gpsLatitude"],
      message: "Capture a valid latitude for direct-site delivery.",
    });
  }
  if (
    value.gpsLongitude === undefined ||
    value.gpsLongitude < -180 ||
    value.gpsLongitude > 180
  ) {
    context.addIssue({
      code: "custom",
      path: ["gpsLongitude"],
      message: "Capture a valid longitude for direct-site delivery.",
    });
  }
  if (!value.gpsCapturedAt) {
    context.addIssue({
      code: "custom",
      path: ["gpsCapturedAt"],
      message: "GPS capture time is required.",
    });
  }
  if (!value.receiverName) {
    context.addIssue({
      code: "custom",
      path: ["receiverName"],
      message: "Receiver name is required.",
    });
  }
});

export const goodsReceiptIdSchema = z.object({ goodsReceiptId: uuid });

export type PurchaseOrderAcceptanceInput = z.infer<
  typeof purchaseOrderAcceptanceSchema
>;
export type PurchaseOrderCancelInput = z.infer<
  typeof purchaseOrderCancelSchema
>;
export type GoodsReceiptDraftInput = z.infer<typeof goodsReceiptDraftSchema>;
