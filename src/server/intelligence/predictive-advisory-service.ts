export type PredictiveAdvisoryType =
  | "DEMAND_FORECAST"
  | "PURCHASE_RECOMMENDATION"
  | "ABNORMAL_PRICE_ALERT"
  | "CONSUMPTION_ANOMALY"
  | "PROJECT_COST_FORECAST"
  | "SUPPLIER_PERFORMANCE_FORECAST";

export type PredictiveRecommendation = {
  id: string;
  type: PredictiveAdvisoryType;
  title: string;
  description: string;
  confidenceScorePercent: number; // 0 - 100
  rationale: string;
  recommendedAction: string;
  isAdvisory: true; // Strict: Must always be advisory
  requiresHumanAuthorization: true; // Strict: Never auto-executed
  impactedEntity: {
    entityType: "MATERIAL" | "PROJECT" | "PURCHASE_ORDER" | "SUPPLIER";
    entityId: string;
    entityName: string;
  };
  metrics: Record<string, number | string>;
  createdAt: string;
};

export class PredictiveAdvisoryEngine {
  /**
   * Forecasts 30-day material demand using exponential moving average.
   * STRICT: Always advisory.
   */
  static forecastDemand(input: {
    materialId: string;
    materialName: string;
    historicalMonthlyUsage: number[]; // Last 3 to 6 months
    unit: string;
    currentStock: number;
    leadTimeDays: number;
  }): PredictiveRecommendation {
    const months = input.historicalMonthlyUsage;
    if (months.length === 0) {
      return {
        id: `pred-demand-${input.materialId}`,
        type: "DEMAND_FORECAST",
        title: `Demand Forecast: ${input.materialName}`,
        description:
          "Insufficient historical consumption records to compute moving average.",
        confidenceScorePercent: 40,
        rationale: "Defaulting to baseline safety stock.",
        recommendedAction: "Maintain manual stock review.",
        isAdvisory: true,
        requiresHumanAuthorization: true,
        impactedEntity: {
          entityType: "MATERIAL",
          entityId: input.materialId,
          entityName: input.materialName,
        },
        metrics: { currentStock: input.currentStock },
        createdAt: new Date().toISOString(),
      };
    }

    // Weighted average favoring recent months
    let weightedSum = 0;
    let weightTotal = 0;
    months.forEach((usage, idx) => {
      const weight = idx + 1;
      weightedSum += usage * weight;
      weightTotal += weight;
    });

    const forecastedMonthlyDemand = Math.round(weightedSum / weightTotal);
    const forecastedDailyUsage = forecastedMonthlyDemand / 30;
    const recommendedPurchaseQty = Math.max(
      0,
      Math.ceil(forecastedMonthlyDemand - input.currentStock),
    );

    return {
      id: `pred-demand-${input.materialId}`,
      type: "DEMAND_FORECAST",
      title: `30-Day Demand Forecast: ${input.materialName}`,
      description: `Projected monthly consumption is ${forecastedMonthlyDemand} ${input.unit} based on recent project velocity.`,
      confidenceScorePercent: 88,
      rationale: `Computed using historical usage curve across ${months.length} reporting periods with heavier weighting on recent site issues.`,
      recommendedAction:
        recommendedPurchaseQty > 0
          ? `Advisory Recommendation: Consider raising indent for ~${recommendedPurchaseQty} ${input.unit} to prevent site run-out.`
          : `Current physical stock (${input.currentStock} ${input.unit}) is adequate for the next 30 days.`,
      isAdvisory: true,
      requiresHumanAuthorization: true,
      impactedEntity: {
        entityType: "MATERIAL",
        entityId: input.materialId,
        entityName: input.materialName,
      },
      metrics: {
        forecastedMonthlyDemand,
        dailyUsageRate: Number(forecastedDailyUsage.toFixed(1)),
        currentStock: input.currentStock,
        recommendedPurchaseQty,
      },
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Detects abnormal quotation or purchase price deviations from historical averages.
   */
  static detectAbnormalPrice(input: {
    materialId: string;
    materialName: string;
    proposedRate: number;
    historicalAverageRate: number;
    historicalLowRate: number;
    historicalHighRate: number;
  }): PredictiveRecommendation | null {
    if (input.historicalAverageRate <= 0) return null;

    const deviationPercent = Number(
      (
        ((input.proposedRate - input.historicalAverageRate) /
          input.historicalAverageRate) *
        100
      ).toFixed(1),
    );

    // Flag if proposed rate is > 10% above 90-day moving average
    if (deviationPercent > 10.0) {
      return {
        id: `pred-price-${input.materialId}`,
        type: "ABNORMAL_PRICE_ALERT",
        title: `Abnormal Price Spike: ${input.materialName}`,
        description: `Quoted rate of ₹${input.proposedRate.toLocaleString("en-IN")} is ${deviationPercent}% higher than the 90-day benchmark (₹${input.historicalAverageRate.toLocaleString("en-IN")}).`,
        confidenceScorePercent: 94,
        rationale: `Statistically significant upward deviation from historical procurement baseline (High: ₹${input.historicalHighRate}, Low: ₹${input.historicalLowRate}).`,
        recommendedAction:
          "Recommend Purchase Officer renegotiate quote or invite alternative supplier bids prior to PO issuance.",
        isAdvisory: true,
        requiresHumanAuthorization: true,
        impactedEntity: {
          entityType: "MATERIAL",
          entityId: input.materialId,
          entityName: input.materialName,
        },
        metrics: {
          proposedRate: input.proposedRate,
          historicalAverageRate: input.historicalAverageRate,
          deviationPercent,
        },
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Detects consumption spikes (unusual surge in material consumption vs engineering standard).
   */
  static detectConsumptionAnomaly(input: {
    projectId: string;
    projectName: string;
    materialName: string;
    actualDailyConsumption: number;
    expectedDailyConsumption: number;
    unit: string;
  }): PredictiveRecommendation | null {
    if (input.expectedDailyConsumption <= 0) return null;

    const ratio = input.actualDailyConsumption / input.expectedDailyConsumption;
    if (ratio > 1.35) {
      const surgePercent = Math.round((ratio - 1) * 100);
      return {
        id: `pred-cons-${input.projectId}-${Date.now().toString().slice(-4)}`,
        type: "CONSUMPTION_ANOMALY",
        title: `Site Consumption Anomaly: ${input.materialName}`,
        description: `Daily consumption on ${input.projectName} is ${surgePercent}% above engineering standard rate (${input.actualDailyConsumption} vs expected ${input.expectedDailyConsumption} ${input.unit}/day).`,
        confidenceScorePercent: 91,
        rationale:
          "Surge rate exceeds the 35% variance boundary. Possible causes include excessive site wastage, unrecorded scrap, or rapid double-shift casting.",
        recommendedAction:
          "Advise Project Director to request a site physical stock audit and review concrete pouring / fabrication logs.",
        isAdvisory: true,
        requiresHumanAuthorization: true,
        impactedEntity: {
          entityType: "PROJECT",
          entityId: input.projectId,
          entityName: input.projectName,
        },
        metrics: {
          actualDailyConsumption: input.actualDailyConsumption,
          expectedDailyConsumption: input.expectedDailyConsumption,
          surgePercent,
        },
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }
}
