export type ProjectProfitabilityReport = {
  projectId: string;
  projectName: string;
  contractValue: number;
  billedToClient: number;
  collectedFromClient: number;
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  overheadCost: number;
  totalCost: number;
  grossProfit: number;
  grossProfitMarginPercent: number;
  netProfit: number;
  netProfitMarginPercent: number;
};

export type MaterialConsumptionTrend = {
  materialCode: string;
  materialName: string;
  unit: string;
  timeframe: string; // e.g., "Month-on-Month"
  dataPoints: { period: string; consumedQuantity: number; cost: number }[];
  movingAverageQuantity: number;
  trendDirection: "UPWARD" | "STABLE" | "DOWNWARD";
};

export type PurchasePriceTrend = {
  materialCode: string;
  materialName: string;
  unit: string;
  currentRate: number;
  previousRate: number;
  rateChangePercent: number;
  threeMonthAverage: number;
  twelveMonthHigh: number;
  twelveMonthLow: number;
  volatilityIndex: "LOW" | "MODERATE" | "HIGH";
};

export type StockAgingBucket = {
  bucketName: "0-30 Days" | "31-60 Days" | "61-90 Days" | "90+ Days";
  itemCount: number;
  valuation: number;
  percentOfTotal: number;
};

export type SlowMovingDeadStockItem = {
  materialId: string;
  materialCode: string;
  materialName: string;
  locationName: string;
  currentStock: number;
  unit: string;
  daysSinceLastIssue: number;
  valuation: number;
  category: "SLOW_MOVING" | "DEAD_STOCK";
  recommendedAction:
    "INTER_SITE_TRANSFER" | "RETURN_TO_SUPPLIER" | "SCRAP_AUCTION";
};

export type WastageAnalysisItem = {
  materialCode: string;
  materialName: string;
  totalInwardQuantity: number;
  theoreticalConsumption: number;
  actualConsumption: number;
  wastageQuantity: number;
  wastagePercent: number;
  permissibleWastagePercent: number;
  varianceStatus: "WITHIN_LIMIT" | "EXCESSIVE";
};

export type PaymentAgingSummary = {
  notDue: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  daysOver90: number;
  totalOutstanding: number;
};

export class AdvancedAnalyticsEngine {
  /**
   * Computes Project Profitability across revenues, direct material, labor, and overhead costs.
   */
  static computeProjectProfitability(input: {
    projectId: string;
    projectName: string;
    contractValue: number;
    billedToClient: number;
    collectedFromClient: number;
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    subcontractorCost: number;
    overheadCost: number;
  }): ProjectProfitabilityReport {
    const directCost =
      input.materialCost +
      input.laborCost +
      input.equipmentCost +
      input.subcontractorCost;
    const totalCost = directCost + input.overheadCost;
    const grossProfit = input.billedToClient - directCost;
    const grossProfitMarginPercent =
      input.billedToClient > 0
        ? Number(((grossProfit / input.billedToClient) * 100).toFixed(2))
        : 0;
    const netProfit = input.billedToClient - totalCost;
    const netProfitMarginPercent =
      input.billedToClient > 0
        ? Number(((netProfit / input.billedToClient) * 100).toFixed(2))
        : 0;

    return {
      projectId: input.projectId,
      projectName: input.projectName,
      contractValue: input.contractValue,
      billedToClient: input.billedToClient,
      collectedFromClient: input.collectedFromClient,
      materialCost: input.materialCost,
      laborCost: input.laborCost,
      equipmentCost: input.equipmentCost,
      subcontractorCost: input.subcontractorCost,
      overheadCost: input.overheadCost,
      totalCost,
      grossProfit,
      grossProfitMarginPercent,
      netProfit,
      netProfitMarginPercent,
    };
  }

  /**
   * Evaluates material consumption trends and calculates moving averages.
   */
  static evaluateConsumptionTrend(
    materialCode: string,
    materialName: string,
    unit: string,
    monthlyConsumption: {
      period: string;
      consumedQuantity: number;
      cost: number;
    }[],
  ): MaterialConsumptionTrend {
    if (monthlyConsumption.length === 0) {
      return {
        materialCode,
        materialName,
        unit,
        timeframe: "Month-on-Month",
        dataPoints: [],
        movingAverageQuantity: 0,
        trendDirection: "STABLE",
      };
    }

    const total = monthlyConsumption.reduce(
      (sum, dp) => sum + dp.consumedQuantity,
      0,
    );
    const movingAverageQuantity = Number(
      (total / monthlyConsumption.length).toFixed(2),
    );

    const firstPeriod = monthlyConsumption[0].consumedQuantity;
    const lastPeriod =
      monthlyConsumption[monthlyConsumption.length - 1].consumedQuantity;
    const change = lastPeriod - firstPeriod;

    let trendDirection: "UPWARD" | "STABLE" | "DOWNWARD" = "STABLE";
    if (change > movingAverageQuantity * 0.1) trendDirection = "UPWARD";
    else if (change < -movingAverageQuantity * 0.1) trendDirection = "DOWNWARD";

    return {
      materialCode,
      materialName,
      unit,
      timeframe: "Month-on-Month",
      dataPoints: monthlyConsumption,
      movingAverageQuantity,
      trendDirection,
    };
  }

  /**
   * Classifies stock into 4 standard aging buckets.
   */
  static calculateStockAgingBuckets(
    items: { daysInStock: number; valuation: number }[],
  ): StockAgingBucket[] {
    const b0To30 = { count: 0, val: 0 };
    const b31To60 = { count: 0, val: 0 };
    const b61To90 = { count: 0, val: 0 };
    const bOver90 = { count: 0, val: 0 };

    for (const item of items) {
      if (item.daysInStock <= 30) {
        b0To30.count++;
        b0To30.val += item.valuation;
      } else if (item.daysInStock <= 60) {
        b31To60.count++;
        b31To60.val += item.valuation;
      } else if (item.daysInStock <= 90) {
        b61To90.count++;
        b61To90.val += item.valuation;
      } else {
        bOver90.count++;
        bOver90.val += item.valuation;
      }
    }

    const totalVal = b0To30.val + b31To60.val + b61To90.val + bOver90.val || 1;

    return [
      {
        bucketName: "0-30 Days",
        itemCount: b0To30.count,
        valuation: b0To30.val,
        percentOfTotal: Number(((b0To30.val / totalVal) * 100).toFixed(1)),
      },
      {
        bucketName: "31-60 Days",
        itemCount: b31To60.count,
        valuation: b31To60.val,
        percentOfTotal: Number(((b31To60.val / totalVal) * 100).toFixed(1)),
      },
      {
        bucketName: "61-90 Days",
        itemCount: b61To90.count,
        valuation: b61To90.val,
        percentOfTotal: Number(((b61To90.val / totalVal) * 100).toFixed(1)),
      },
      {
        bucketName: "90+ Days",
        itemCount: bOver90.count,
        valuation: bOver90.val,
        percentOfTotal: Number(((bOver90.val / totalVal) * 100).toFixed(1)),
      },
    ];
  }

  /**
   * Identifies slow-moving and dead-stock inventory.
   */
  static identifyDeadStock(
    items: {
      materialId: string;
      materialCode: string;
      materialName: string;
      locationName: string;
      currentStock: number;
      unit: string;
      daysSinceLastIssue: number;
      unitRate: number;
    }[],
  ): SlowMovingDeadStockItem[] {
    const results: SlowMovingDeadStockItem[] = [];

    for (const it of items) {
      if (it.currentStock <= 0) continue;
      const valuation = it.currentStock * it.unitRate;

      if (it.daysSinceLastIssue > 90) {
        results.push({
          materialId: it.materialId,
          materialCode: it.materialCode,
          materialName: it.materialName,
          locationName: it.locationName,
          currentStock: it.currentStock,
          unit: it.unit,
          daysSinceLastIssue: it.daysSinceLastIssue,
          valuation,
          category: "DEAD_STOCK",
          recommendedAction:
            it.daysSinceLastIssue > 180
              ? "SCRAP_AUCTION"
              : "INTER_SITE_TRANSFER",
        });
      } else if (it.daysSinceLastIssue > 45) {
        results.push({
          materialId: it.materialId,
          materialCode: it.materialCode,
          materialName: it.materialName,
          locationName: it.locationName,
          currentStock: it.currentStock,
          unit: it.unit,
          daysSinceLastIssue: it.daysSinceLastIssue,
          valuation,
          category: "SLOW_MOVING",
          recommendedAction: "INTER_SITE_TRANSFER",
        });
      }
    }

    return results;
  }

  /**
   * Analyzes material wastage against sanctioned tolerance standards.
   */
  static analyzeWastage(input: {
    materialCode: string;
    materialName: string;
    totalInwardQuantity: number;
    theoreticalConsumption: number;
    actualConsumption: number;
    permissibleWastagePercent: number; // e.g. 3.0 for 3%
  }): WastageAnalysisItem {
    const wastageQuantity =
      input.actualConsumption - input.theoreticalConsumption;
    const wastagePercent =
      input.theoreticalConsumption > 0
        ? Number(
            ((wastageQuantity / input.theoreticalConsumption) * 100).toFixed(2),
          )
        : 0;
    const varianceStatus =
      wastagePercent > input.permissibleWastagePercent
        ? "EXCESSIVE"
        : "WITHIN_LIMIT";

    return {
      materialCode: input.materialCode,
      materialName: input.materialName,
      totalInwardQuantity: input.totalInwardQuantity,
      theoreticalConsumption: input.theoreticalConsumption,
      actualConsumption: input.actualConsumption,
      wastageQuantity: Math.max(0, wastageQuantity),
      wastagePercent: Math.max(0, wastagePercent),
      permissibleWastagePercent: input.permissibleWastagePercent,
      varianceStatus,
    };
  }
}
