export type MaterialIssueStatus =
  "DRAFT" | "POSTED" | "ACKNOWLEDGED" | "CANCELLED";

export type StockTransferStatus =
  "DRAFT" | "DISPATCHED" | "RECEIVED" | "CANCELLED";

export type StockAdjustmentStatus =
  "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "POSTED" | "CANCELLED";

export type StockCountStatus =
  "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "POSTED" | "CANCELLED";

function assertFiniteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number.`);
  }
}

export function assertPositiveMovementQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Movement quantity must be greater than zero.");
  }
}

export function assertSufficientStock(
  availableQuantity: number,
  requestedQuantity: number,
) {
  assertFiniteNonNegative(availableQuantity, "availableQuantity");
  assertPositiveMovementQuantity(requestedQuantity);

  if (requestedQuantity > availableQuantity) {
    throw new Error("Insufficient stock for this movement.");
  }
}

export function canPostMaterialIssue(status: MaterialIssueStatus): boolean {
  return status === "DRAFT";
}

export function canAcknowledgeMaterialIssue(
  status: MaterialIssueStatus,
): boolean {
  return status === "POSTED";
}

export function canDispatchTransfer(status: StockTransferStatus): boolean {
  return status === "DRAFT";
}

export function canReceiveTransfer(status: StockTransferStatus): boolean {
  return status === "DISPATCHED";
}

export function stockCountVariance(
  bookQuantity: number,
  countedQuantity: number,
): {
  varianceQuantity: number;
  transactionType: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | null;
  transactionQuantity: number;
} {
  assertFiniteNonNegative(bookQuantity, "bookQuantity");
  assertFiniteNonNegative(countedQuantity, "countedQuantity");

  const varianceQuantity = countedQuantity - bookQuantity;

  if (varianceQuantity === 0) {
    return {
      varianceQuantity: 0,
      transactionType: null,
      transactionQuantity: 0,
    };
  }

  return {
    varianceQuantity,
    transactionType: varianceQuantity > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
    transactionQuantity: Math.abs(varianceQuantity),
  };
}

export function validateIssuedMaterialReconciliation(input: {
  issuedQuantity: number;
  consumedQuantity: number;
  returnedQuantity: number;
  wastageQuantity: number;
  scrapQuantity: number;
}) {
  assertFiniteNonNegative(input.issuedQuantity, "issuedQuantity");
  assertFiniteNonNegative(input.consumedQuantity, "consumedQuantity");
  assertFiniteNonNegative(input.returnedQuantity, "returnedQuantity");
  assertFiniteNonNegative(input.wastageQuantity, "wastageQuantity");
  assertFiniteNonNegative(input.scrapQuantity, "scrapQuantity");

  const reconciledQuantity =
    input.consumedQuantity +
    input.returnedQuantity +
    input.wastageQuantity +
    input.scrapQuantity;

  if (reconciledQuantity > input.issuedQuantity) {
    throw new Error("Issued-material reconciliation exceeds issued quantity.");
  }

  return {
    reconciledQuantity,
    remainingQuantity: input.issuedQuantity - reconciledQuantity,
  };
}

export function canPostAdjustment(status: StockAdjustmentStatus): boolean {
  return status === "APPROVED";
}

export function canPostStockCount(status: StockCountStatus): boolean {
  return status === "APPROVED";
}
