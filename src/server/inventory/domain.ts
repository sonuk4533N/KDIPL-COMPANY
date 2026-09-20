export interface ReceiptQuantityInput {
  orderedQuantity: number;
  previouslyAcceptedQuantity: number;
  previouslyDamagedQuantity: number;
  previouslyRejectedQuantity: number;
  acceptedQuantity: number;
  damagedQuantity: number;
  rejectedQuantity: number;
  allowExcess?: boolean;
}

export interface ReceiptQuantityResult {
  receivedQuantity: number;
  cumulativeAcceptedQuantity: number;
  cumulativeNonConformingQuantity: number;
  remainingAcceptableQuantity: number;
  replacementAllowance: number;
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
    input.previouslyAcceptedQuantity,
    "previouslyAcceptedQuantity",
  );
  assertFiniteNonNegative(
    input.previouslyDamagedQuantity,
    "previouslyDamagedQuantity",
  );
  assertFiniteNonNegative(
    input.previouslyRejectedQuantity,
    "previouslyRejectedQuantity",
  );
  assertFiniteNonNegative(input.acceptedQuantity, "acceptedQuantity");
  assertFiniteNonNegative(input.damagedQuantity, "damagedQuantity");
  assertFiniteNonNegative(input.rejectedQuantity, "rejectedQuantity");

  if (input.orderedQuantity <= 0) {
    throw new Error("orderedQuantity must be greater than zero.");
  }

  const cumulativeAcceptedQuantity =
    input.previouslyAcceptedQuantity + input.acceptedQuantity;

  if (
    cumulativeAcceptedQuantity > input.orderedQuantity &&
    !input.allowExcess
  ) {
    throw new Error("Accepted quantity exceeds the purchase-order quantity.");
  }

  const previousNonConforming =
    input.previouslyDamagedQuantity + input.previouslyRejectedQuantity;
  const currentNonConforming = input.damagedQuantity + input.rejectedQuantity;
  const receivedQuantity = input.acceptedQuantity + currentNonConforming;

  // Replacement deliveries may exceed the original gross delivered quantity only
  // to replace quantities that were previously damaged or rejected. This prevents
  // true over-receipt while still supporting supplier replacement material.
  const replacementAllowance = previousNonConforming;
  const remainingAcceptableQuantity =
    input.orderedQuantity - input.previouslyAcceptedQuantity;
  const maximumCurrentDelivery =
    remainingAcceptableQuantity + replacementAllowance;

  if (receivedQuantity > maximumCurrentDelivery && !input.allowExcess) {
    throw new Error(
      "Delivery exceeds remaining PO quantity plus approved replacement allowance.",
    );
  }

  return {
    receivedQuantity,
    cumulativeAcceptedQuantity,
    cumulativeNonConformingQuantity:
      previousNonConforming + currentNonConforming,
    remainingAcceptableQuantity: Math.max(
      0,
      input.orderedQuantity - cumulativeAcceptedQuantity,
    ),
    replacementAllowance,
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

export type InventoryBalanceTransaction = {
  quantity: number;
  transactionType: string;
};

export function calculateDerivedInventoryBalance(
  transactions: readonly InventoryBalanceTransaction[],
): { quantityOnHand: number } {
  let quantityOnHand = 0;
  for (const tx of transactions) {
    const direction = stockDirectionForTransaction(tx.transactionType);
    if (direction === "IN") {
      quantityOnHand += tx.quantity;
    } else {
      quantityOnHand -= tx.quantity;
    }
  }
  return { quantityOnHand };
}

export type PurchaseOrderStatus =
  | "DRAFT"
  | "ISSUED"
  | "ACCEPTED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CLOSED"
  | "CANCELLED";

export function canIssuePurchaseOrder(status: PurchaseOrderStatus): boolean {
  return status === "DRAFT";
}

export function canAcceptPurchaseOrder(status: PurchaseOrderStatus): boolean {
  return status === "ISSUED";
}

export function canPostGoodsReceipt(status: PurchaseOrderStatus): boolean {
  // Supplier acknowledgment is tracked but does not gate physical receiving.
  return (
    status === "ISSUED" ||
    status === "ACCEPTED" ||
    status === "PARTIALLY_RECEIVED"
  );
}

export function purchaseOrderStatusAfterReceipt(
  orderedQuantity: number,
  cumulativeAcceptedQuantity: number,
): "PARTIALLY_RECEIVED" | "RECEIVED" {
  if (orderedQuantity <= 0) {
    throw new Error("orderedQuantity must be greater than zero.");
  }
  if (cumulativeAcceptedQuantity < 0) {
    throw new Error("cumulativeAcceptedQuantity cannot be negative.");
  }
  return cumulativeAcceptedQuantity >= orderedQuantity
    ? "RECEIVED"
    : "PARTIALLY_RECEIVED";
}
