export interface ReceiptQuantityInput {
  orderedQuantity: number;
  previouslyReceivedQuantity: number;
  acceptedQuantity: number;
  damagedQuantity: number;
  rejectedQuantity: number;
}

export interface ReceiptQuantityResult {
  receivedQuantity: number;
  cumulativeReceivedQuantity: number;
  remainingQuantity: number;
}

function assertFiniteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number.`);
  }
}

export function calculateReceiptQuantities(
  input: ReceiptQuantityInput,
): ReceiptQuantityResult {
  assertFiniteNonNegative(input.orderedQuantity, "orderedQuantity");
  assertFiniteNonNegative(
    input.previouslyReceivedQuantity,
    "previouslyReceivedQuantity",
  );
  assertFiniteNonNegative(input.acceptedQuantity, "acceptedQuantity");
  assertFiniteNonNegative(input.damagedQuantity, "damagedQuantity");
  assertFiniteNonNegative(input.rejectedQuantity, "rejectedQuantity");

  if (input.orderedQuantity <= 0) {
    throw new Error("orderedQuantity must be greater than zero.");
  }

  const receivedQuantity =
    input.acceptedQuantity + input.damagedQuantity + input.rejectedQuantity;
  const cumulativeReceivedQuantity =
    input.previouslyReceivedQuantity + receivedQuantity;

  if (cumulativeReceivedQuantity > input.orderedQuantity) {
    throw new Error("Receipt exceeds the purchase-order quantity.");
  }

  return {
    receivedQuantity,
    cumulativeReceivedQuantity,
    remainingQuantity: input.orderedQuantity - cumulativeReceivedQuantity,
  };
}

export type StockDirection = "IN" | "OUT";

export function stockDirectionForTransaction(type: string): StockDirection {
  switch (type) {
    case "OPENING":
    case "RECEIPT":
    case "TRANSFER_IN":
    case "ADJUSTMENT_IN":
      return "IN";
    case "ISSUE":
    case "TRANSFER_OUT":
    case "ADJUSTMENT_OUT":
      return "OUT";
    default:
      throw new Error(`Unsupported stock transaction type: ${type}`);
  }
}

export function canPostGoodsReceipt(purchaseOrderStatus: string): boolean {
  // Phase 4 currently creates DRAFT purchase orders only. Stock must never be
  // increased until a later approved increment defines an issued/accepted PO.
  return purchaseOrderStatus === "ISSUED" || purchaseOrderStatus === "ACCEPTED";
}
