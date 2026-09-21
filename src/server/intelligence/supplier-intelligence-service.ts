export type SupplierDeliveryRecord = {
  poNumber: string;
  expectedDate: string;
  actualDate: string;
  orderedQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unitPrice: number;
};

export type SupplierScorecard = {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  totalOrderValue: number;
  onTimeInFullRatePercent: number; // OTIF
  qualityAcceptanceRatePercent: number;
  rejectionRatePercent: number;
  averageDeliveryDelayDays: number;
  compositeScore: number; // Scale 0 - 100
  tier:
    | "PLATINUM_PREFERRED"
    | "GOLD_RELIABLE"
    | "SILVER_MONITORED"
    | "RISK_SUSPENDED";
  riskIndicators: string[];
};

export type SupplierComparisonMatrix = {
  materialCode: string;
  materialName: string;
  suppliers: {
    supplierId: string;
    supplierName: string;
    latestPrice: number;
    otifRatePercent: number;
    qualityRatePercent: number;
    compositeScore: number;
    preferredRank: number;
  }[];
};

export class SupplierIntelligenceEngine {
  /**
   * Computes comprehensive supplier scorecard including OTIF and quality metrics.
   */
  static computeSupplierScorecard(
    supplierId: string,
    supplierName: string,
    records: SupplierDeliveryRecord[],
  ): SupplierScorecard {
    if (records.length === 0) {
      return {
        supplierId,
        supplierName,
        totalOrders: 0,
        totalOrderValue: 0,
        onTimeInFullRatePercent: 100,
        qualityAcceptanceRatePercent: 100,
        rejectionRatePercent: 0,
        averageDeliveryDelayDays: 0,
        compositeScore: 100,
        tier: "GOLD_RELIABLE",
        riskIndicators: ["No historical delivery records"],
      };
    }

    let otifOrdersCount = 0;
    let totalOrderedQty = 0;
    let totalReceivedQty = 0;
    let totalAcceptedQty = 0;
    let totalRejectedQty = 0;
    let totalOrderValue = 0;
    let totalDelayDays = 0;

    for (const rec of records) {
      totalOrderedQty += rec.orderedQty;
      totalReceivedQty += rec.receivedQty;
      totalAcceptedQty += rec.acceptedQty;
      totalRejectedQty += rec.rejectedQty;
      totalOrderValue += rec.orderedQty * rec.unitPrice;

      const expected = new Date(rec.expectedDate).getTime();
      const actual = new Date(rec.actualDate).getTime();
      const delayDays = Math.max(
        0,
        Math.round((actual - expected) / (1000 * 3600 * 24)),
      );
      totalDelayDays += delayDays;

      // OTIF definition: delivered on or before expected date, and receivedQty >= orderedQty
      if (delayDays === 0 && rec.receivedQty >= rec.orderedQty) {
        otifOrdersCount++;
      }
    }

    const otifRatePercent = Number(
      ((otifOrdersCount / records.length) * 100).toFixed(1),
    );
    const qualityAcceptanceRatePercent =
      totalReceivedQty > 0
        ? Number(((totalAcceptedQty / totalReceivedQty) * 100).toFixed(1))
        : 100;
    const rejectionRatePercent =
      totalReceivedQty > 0
        ? Number(((totalRejectedQty / totalReceivedQty) * 100).toFixed(1))
        : 0;
    const averageDeliveryDelayDays = Number(
      (totalDelayDays / records.length).toFixed(1),
    );

    // Composite scoring weights:
    // OTIF: 40%
    // Quality Acceptance: 40%
    // Fulfillment Ratio: 20%
    const fulfillmentRatio =
      totalOrderedQty > 0
        ? Math.min(100, (totalAcceptedQty / totalOrderedQty) * 100)
        : 100;

    const compositeScore = Number(
      (
        otifRatePercent * 0.4 +
        qualityAcceptanceRatePercent * 0.4 +
        fulfillmentRatio * 0.2
      ).toFixed(1),
    );

    const riskIndicators: string[] = [];
    if (rejectionRatePercent > 5.0) {
      riskIndicators.push(
        `Elevated rejection rate of ${rejectionRatePercent}% exceeds 5% engineering limit`,
      );
    }
    if (otifRatePercent < 80.0) {
      riskIndicators.push(
        `Low on-time delivery rate (${otifRatePercent}%) risks site work schedules`,
      );
    }
    if (averageDeliveryDelayDays > 4.0) {
      riskIndicators.push(
        `Average delivery delay of ${averageDeliveryDelayDays} days requires escalation`,
      );
    }

    let tier: SupplierScorecard["tier"] = "SILVER_MONITORED";
    if (compositeScore >= 90 && riskIndicators.length === 0) {
      tier = "PLATINUM_PREFERRED";
    } else if (compositeScore >= 80) {
      tier = "GOLD_RELIABLE";
    } else if (compositeScore < 60 || rejectionRatePercent > 10) {
      tier = "RISK_SUSPENDED";
    }

    return {
      supplierId,
      supplierName,
      totalOrders: records.length,
      totalOrderValue,
      onTimeInFullRatePercent: otifRatePercent,
      qualityAcceptanceRatePercent,
      rejectionRatePercent,
      averageDeliveryDelayDays,
      compositeScore,
      tier,
      riskIndicators,
    };
  }

  /**
   * Compares multiple vendors for a material and ranks preferred sources.
   */
  static compareSuppliers(
    materialCode: string,
    materialName: string,
    candidates: {
      supplierId: string;
      supplierName: string;
      latestPrice: number;
      records: SupplierDeliveryRecord[];
    }[],
  ): SupplierComparisonMatrix {
    const scored = candidates.map((cand) => {
      const card = this.computeSupplierScorecard(
        cand.supplierId,
        cand.supplierName,
        cand.records,
      );
      return {
        supplierId: cand.supplierId,
        supplierName: cand.supplierName,
        latestPrice: cand.latestPrice,
        otifRatePercent: card.onTimeInFullRatePercent,
        qualityRatePercent: card.qualityAcceptanceRatePercent,
        compositeScore: card.compositeScore,
      };
    });

    // Sort by compositeScore descending, then lowest price
    scored.sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) {
        return b.compositeScore - a.compositeScore;
      }
      return a.latestPrice - b.latestPrice;
    });

    return {
      materialCode,
      materialName,
      suppliers: scored.map((s, idx) => ({ ...s, preferredRank: idx + 1 })),
    };
  }
}
