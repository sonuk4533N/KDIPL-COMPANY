import { z } from "zod";

export const grnEvidenceSchema = z.object({
  goodsReceiptId: z.string().uuid(),
  documentType: z.enum([
    "DELIVERY_CHALLAN",
    "MATERIAL_PHOTO",
    "SUPPLIER_INVOICE",
    "RECEIVER_SIGNATURE",
  ]),
});

export const siteAcknowledgmentSchema = z.object({
  goodsReceiptId: z.string().uuid(),
});

export type GoodsReceiptDocumentTypeInput = z.infer<
  typeof grnEvidenceSchema
>["documentType"];
