export type InventoryOptimizationParameters = {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  locationId: string;
  locationName: string;
  currentStock: number;
  averageDailyUsage: number;
  leadTimeDays: number;
  leadTimeDemandVariabilityFactor: number; // Z-score * std-dev (e.g. 1.65 for 95% service level)
  maxDailyUsage: number;
  maxLeadTimeDays: number;
};

export type OptimizedStockPolicy = {
  materialId: string;
  materialCode: string;
  materialName: string;
  locationName: string;
  currentStock: number;
  unit: string;
  safetyStock: number;
  reorderPoint: number;
  minimumStock: number;
  maximumStock: number;
  recommendedOrderQuantity: number;
  inventoryStatus:
    "HEALTHY" | "REORDER_TRIGGERED" | "CRITICAL_SHORTAGE" | "EXCESS_STOCK";
  suggestedAction?: string;
};

export class InventoryOptimizationEngine {
  /**
   * Computes dynamic Safety Stock and Reorder Point (ROP).
   * Formula:
   * Safety Stock = (Max Daily Usage * Max Lead Time) - (Avg Daily Usage * Avg Lead Time)
   * Reorder Point = (Avg Daily Usage * Avg Lead Time) + Safety Stock
   * Min Stock = Safety Stock
   * Max Stock = Reorder Point + Economic Reorder Quantity (approx 15-day demand)
   */
  static computeStockPolicy(
    params: InventoryOptimizationParameters,
  ): OptimizedStockPolicy {
    const avgLeadTimeDemand = params.averageDailyUsage * params.leadTimeDays;
    const maxLeadTimeDemand = params.maxDailyUsage * params.maxLeadTimeDays;

    const safetyStock = Math.max(
      0,
      Math.ceil(maxLeadTimeDemand - avgLeadTimeDemand),
    );
    const reorderPoint = Math.ceil(avgLeadTimeDemand + safetyStock);
    const minimumStock = safetyStock;
    const recommendedOrderQuantity = Math.ceil(params.averageDailyUsage * 15); // 15-day batch
    const maximumStock = reorderPoint + recommendedOrderQuantity;

    let inventoryStatus: OptimizedStockPolicy["inventoryStatus"] = "HEALTHY";
    let suggestedAction: string | undefined;

    if (params.currentStock <= minimumStock) {
      inventoryStatus = "CRITICAL_SHORTAGE";
      suggestedAction = `Critical: Current physical stock (${params.currentStock} ${params.unit}) is below safety threshold (${minimumStock} ${params.unit}). Expedite PO creation immediately.`;
    } else if (params.currentStock <= reorderPoint) {
      inventoryStatus = "REORDER_TRIGGERED";
      suggestedAction = `Reorder point triggered: Current stock (${params.currentStock} ${params.unit}) is at or below ROP (${reorderPoint} ${params.unit}). Raise indent for ${recommendedOrderQuantity} ${params.unit}.`;
    } else if (params.currentStock > maximumStock) {
      inventoryStatus = "EXCESS_STOCK";
      suggestedAction = `Excess stock alert: Current stock (${params.currentStock} ${params.unit}) exceeds maximum warehouse ceiling (${maximumStock} ${params.unit}). Halt purchasing and consider inter-site transfer.`;
    }

    return {
      materialId: params.materialId,
      materialCode: params.materialCode,
      materialName: params.materialName,
      locationName: params.locationName,
      currentStock: params.currentStock,
      unit: params.unit,
      safetyStock,
      reorderPoint,
      minimumStock,
      maximumStock,
      recommendedOrderQuantity,
      inventoryStatus,
      suggestedAction,
    };
  }

  /**
   * Scans a batch of inventory locations and returns low stock and replenishment lists.
   */
  static evaluateInventoryReplenishment(
    inventoryList: InventoryOptimizationParameters[],
  ): {
    healthyCount: number;
    reorderCount: number;
    criticalCount: number;
    excessCount: number;
    replenishmentRecommendations: OptimizedStockPolicy[];
  } {
    let healthyCount = 0;
    let reorderCount = 0;
    let criticalCount = 0;
    let excessCount = 0;
    const replenishmentRecommendations: OptimizedStockPolicy[] = [];

    for (const item of inventoryList) {
      const policy = this.computeStockPolicy(item);
      if (policy.inventoryStatus === "HEALTHY") {
        healthyCount++;
      } else if (policy.inventoryStatus === "REORDER_TRIGGERED") {
        reorderCount++;
        replenishmentRecommendations.push(policy);
      } else if (policy.inventoryStatus === "CRITICAL_SHORTAGE") {
        criticalCount++;
        replenishmentRecommendations.push(policy);
      } else if (policy.inventoryStatus === "EXCESS_STOCK") {
        excessCount++;
      }
    }

    return {
      healthyCount,
      reorderCount,
      criticalCount,
      excessCount,
      replenishmentRecommendations,
    };
  }
}
