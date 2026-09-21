export type ProcurementApprovalAuthority =
  | "SITE_SUPERVISOR"
  | "PURCHASE_MANAGER"
  | "PROJECT_DIRECTOR"
  | "MANAGING_DIRECTOR";

export type RateContractAgreement = {
  contractId: string;
  contractNumber: string;
  supplierId: string;
  supplierName: string;
  materialCode: string;
  agreedUnitRate: number;
  ceilingQuantity: number;
  orderedQuantity: number;
  remainingQuantity: number;
  validFrom: string;
  validTo: string;
  liquidatedDamagesPercentPerWeek: number;
  status: "ACTIVE" | "EXPIRED" | "TERMINATED";
};

export type PhasedDeliveryScheduleItem = {
  lotNumber: number;
  expectedDeliveryDate: string;
  scheduledQuantity: number;
  deliveredQuantity: number;
  deliverySiteId: string;
  status: "SCHEDULED" | "DISPATCHED" | "DELIVERED" | "OVERDUE";
};

export type AnnualProcurementPlan = {
  planId: string;
  financialYear: string;
  category: string;
  annualBudget: number;
  committedAmount: number;
  consumedAmount: number;
  balanceBudget: number;
  utilizationPercent: number;
};

export class AdvancedProcurementService {
  /**
   * Resolves the required approval level in the enterprise procurement approval matrix
   * based on order value in INR.
   *
   * Thresholds:
   * - <= ₹50,000: SITE_SUPERVISOR
   * - <= ₹5,00,000: PURCHASE_MANAGER
   * - <= ₹25,00,000: PROJECT_DIRECTOR
   * - > ₹25,00,000: MANAGING_DIRECTOR
   */
  static resolveProcurementApprovalLevel(orderValueINR: number): {
    requiredAuthority: ProcurementApprovalAuthority;
    isExecutiveSignoff: boolean;
    description: string;
  } {
    if (orderValueINR <= 50000) {
      return {
        requiredAuthority: "SITE_SUPERVISOR",
        isExecutiveSignoff: false,
        description: "Routine site expense approved by Site In-charge / Supervisor.",
      };
    }
    if (orderValueINR <= 500000) {
      return {
        requiredAuthority: "PURCHASE_MANAGER",
        isExecutiveSignoff: false,
        description: "Operational PO authorized by Central Purchase / Project Manager.",
      };
    }
    if (orderValueINR <= 2500000) {
      return {
        requiredAuthority: "PROJECT_DIRECTOR",
        isExecutiveSignoff: true,
        description: "High-value procurement requiring Project Director authorization.",
      };
    }
    return {
      requiredAuthority: "MANAGING_DIRECTOR",
      isExecutiveSignoff: true,
      description: "Major capital commitment (> ₹25 Lakhs) requiring Managing Director approval.",
    };
  }

  /**
   * Verifies if a purchase order qualifies under an active Rate Contract (RC).
   * Validates rate, ceiling quantity, and validity date.
   */
  static validateRateContractOrder(
    contract: RateContractAgreement,
    orderQuantity: number,
    orderDate = new Date(),
  ): {
    isValid: boolean;
    reason?: string;
    effectiveRate: number;
    newRemainingQuantity: number;
  } {
    if (contract.status !== "ACTIVE") {
      return {
        isValid: false,
        reason: `Rate contract is not active (${contract.status})`,
        effectiveRate: contract.agreedUnitRate,
        newRemainingQuantity: contract.remainingQuantity,
      };
    }

    const orderTime = orderDate.getTime();
    const startTime = new Date(contract.validFrom).getTime();
    const endTime = new Date(contract.validTo).getTime();

    if (orderTime < startTime || orderTime > endTime) {
      return {
        isValid: false,
        reason: "Order date is outside the approved Rate Contract validity window",
        effectiveRate: contract.agreedUnitRate,
        newRemainingQuantity: contract.remainingQuantity,
      };
    }

    if (orderQuantity > contract.remainingQuantity) {
      return {
        isValid: false,
        reason: `Requested quantity (${orderQuantity}) exceeds remaining contract ceiling (${contract.remainingQuantity})`,
        effectiveRate: contract.agreedUnitRate,
        newRemainingQuantity: contract.remainingQuantity,
      };
    }

    return {
      isValid: true,
      effectiveRate: contract.agreedUnitRate,
      newRemainingQuantity: contract.remainingQuantity - orderQuantity,
    };
  }

  /**
   * Generates a phased delivery schedule from a bulk procurement quantity.
   */
  static generatePhasedSchedule(
    totalQuantity: number,
    lotsCount: number,
    intervalDays: number,
    siteId: string,
    startDate = new Date(),
  ): PhasedDeliveryScheduleItem[] {
    const safeLots = Math.max(1, Math.min(lotsCount, 12));
    const qtyPerLot = Number((totalQuantity / safeLots).toFixed(2));
    const schedule: PhasedDeliveryScheduleItem[] = [];

    let accumulatedQty = 0;
    for (let i = 1; i <= safeLots; i++) {
      const deliveryDate = new Date(
        startDate.getTime() + (i - 1) * intervalDays * 24 * 60 * 60 * 1000,
      );
      const isLast = i === safeLots;
      const thisLotQty = isLast ? Number((totalQuantity - accumulatedQty).toFixed(2)) : qtyPerLot;
      accumulatedQty += thisLotQty;

      schedule.push({
        lotNumber: i,
        expectedDeliveryDate: deliveryDate.toISOString().split("T")[0],
        scheduledQuantity: thisLotQty,
        deliveredQuantity: 0,
        deliverySiteId: siteId,
        status: "SCHEDULED",
      });
    }

    return schedule;
  }

  /**
   * Calculates Annual Procurement Plan (APP) budget utilization and warns if approaching ceiling.
   */
  static evaluatePlanUtilization(input: {
    annualBudget: number;
    committedAmount: number;
    newOrderAmount: number;
  }): {
    utilizationPercent: number;
    isOverBudget: boolean;
    remainingBuffer: number;
    status: "HEALTHY" | "WARNING_NEAR_LIMIT" | "BUDGET_EXCEEDED";
  } {
    const totalExposure = input.committedAmount + input.newOrderAmount;
    const remainingBuffer = input.annualBudget - totalExposure;
    const utilizationPercent =
      input.annualBudget > 0 ? Number(((totalExposure / input.annualBudget) * 100).toFixed(2)) : 0;

    let status: "HEALTHY" | "WARNING_NEAR_LIMIT" | "BUDGET_EXCEEDED" = "HEALTHY";
    if (utilizationPercent > 100) {
      status = "BUDGET_EXCEEDED";
    } else if (utilizationPercent >= 85) {
      status = "WARNING_NEAR_LIMIT";
    }

    return {
      utilizationPercent,
      isOverBudget: totalExposure > input.annualBudget,
      remainingBuffer,
      status,
    };
  }
}
