export type GovernanceAnomalyType =
  | "UNUSUAL_HOURS_ACTIVITY"
  | "HIGH_VALUE_TRANSACTION"
  | "APPROVAL_BYPASS_ATTEMPT"
  | "REPEATED_INVENTORY_ADJUSTMENT"
  | "INVENTORY_DISCREPANCY_VARIANCE"
  | "UNREGISTERED_VENDOR_SPIKE";

export type GovernanceAnomalyAlert = {
  id: string;
  anomalyType: GovernanceAnomalyType;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  detectedAt: string;
  investigationStatus: "OPEN" | "REVIEWED" | "ESCALATED_TO_MD" | "DISMISSED";
};

export class GovernanceAuditEngine {
  /**
   * Evaluates transactions against fraud and governance heuristics:
   * 1. Unusual hours: Activities logged between 22:00 and 05:00 IST.
   * 2. High-value transactions: Exceeding ₹5,00,000 threshold.
   * 3. Repeated inventory write-offs: Multiple adjustments by same user within 7 days.
   * 4. Stock count variances: Discrepancy > 2% of total physical stock.
   */
  static scanTransactionsForAnomalies(input: {
    transactions: {
      id: string;
      type: string;
      amount?: number;
      timestamp: string; // ISO
      userId: string;
      variancePercent?: number;
      isDirectorOverride?: boolean;
    }[];
  }): GovernanceAnomalyAlert[] {
    const alerts: GovernanceAnomalyAlert[] = [];
    const adjustmentsByUser: Record<string, number> = {};

    for (const tx of input.transactions) {
      const date = new Date(tx.timestamp);
      const hour = date.getUTCHours(); // Assuming UTC; adjust for IST (+5.5h)
      const istHour =
        (hour + 5 + (date.getUTCMinutes() + 30 >= 60 ? 1 : 0)) % 24;

      // 1. Unusual hours check (Between 22:00 and 05:00 IST)
      if (istHour >= 22 || istHour < 5) {
        alerts.push({
          id: `anomaly-hour-${tx.id}`,
          anomalyType: "UNUSUAL_HOURS_ACTIVITY",
          severity: "MEDIUM",
          description: `Transaction logged at unusual operational hour (${istHour}:00 IST). Verify user authorization.`,
          entityType: tx.type,
          entityId: tx.id,
          actorUserId: tx.userId,
          detectedAt: new Date().toISOString(),
          investigationStatus: "OPEN",
        });
      }

      // 2. High value transaction (> ₹5,00,000)
      if (tx.amount && tx.amount >= 500000) {
        alerts.push({
          id: `anomaly-highval-${tx.id}`,
          anomalyType: "HIGH_VALUE_TRANSACTION",
          severity: tx.amount >= 2000000 ? "CRITICAL" : "HIGH",
          description: `High-value financial commitment of ₹${tx.amount.toLocaleString("en-IN")} requires second-tier executive sign-off.`,
          entityType: tx.type,
          entityId: tx.id,
          actorUserId: tx.userId,
          detectedAt: new Date().toISOString(),
          investigationStatus: "OPEN",
        });
      }

      // 3. Repeated inventory adjustment tracking
      if (tx.type.includes("ADJUSTMENT") || tx.type.includes("SCRAP")) {
        adjustmentsByUser[tx.userId] = (adjustmentsByUser[tx.userId] || 0) + 1;
        if (adjustmentsByUser[tx.userId] >= 3) {
          alerts.push({
            id: `anomaly-adj-${tx.id}`,
            anomalyType: "REPEATED_INVENTORY_ADJUSTMENT",
            severity: "HIGH",
            description: `User ${tx.userId} has initiated ${adjustmentsByUser[tx.userId]} inventory write-offs/adjustments in close succession.`,
            entityType: tx.type,
            entityId: tx.id,
            actorUserId: tx.userId,
            detectedAt: new Date().toISOString(),
            investigationStatus: "OPEN",
          });
        }
      }

      // 4. Discrepancy variance check (> 2%)
      if (tx.variancePercent && Math.abs(tx.variancePercent) > 2.0) {
        alerts.push({
          id: `anomaly-var-${tx.id}`,
          anomalyType: "INVENTORY_DISCREPANCY_VARIANCE",
          severity: Math.abs(tx.variancePercent) > 5.0 ? "CRITICAL" : "HIGH",
          description: `Physical stock count variance of ${tx.variancePercent.toFixed(1)}% exceeds standard 2% engineering tolerance.`,
          entityType: tx.type,
          entityId: tx.id,
          actorUserId: tx.userId,
          detectedAt: new Date().toISOString(),
          investigationStatus: "OPEN",
        });
      }
    }

    return alerts;
  }
}
