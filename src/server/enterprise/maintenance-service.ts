export type MaintenanceType = "PREVENTIVE" | "BREAKDOWN" | "OVERHAUL" | "CALIBRATION";

export type MaintenanceSeverity = "CRITICAL" | "MAJOR" | "MINOR";

export type MaintenanceTicket = {
  ticketId: string;
  ticketNumber: string;
  assetId: string;
  assetCode: string;
  type: MaintenanceType;
  severity: MaintenanceSeverity;
  description: string;
  reportedDate: string;
  downtimeHours: number;
  assignedTechnician?: string;
  status: "OPEN" | "IN_PROGRESS" | "PARTS_AWAITED" | "RESOLVED" | "CLOSED";
  sparesConsumedCostINR: number;
  labourCostINR: number;
  totalMaintenanceCostINR: number;
};

export type ReliabilityMetrics = {
  assetId: string;
  totalOperatingHours: number;
  breakdownCount: number;
  totalDowntimeHours: number;
  mtbfHours: number; // Mean Time Between Failures
  mttrHours: number; // Mean Time To Repair
  inherentAvailabilityPercent: number;
  status: "OPTIMAL" | "ATTENTION_REQUIRED" | "HIGH_MAINTENANCE_BURDEN";
};

export class MaintenanceManagementService {
  /**
   * Computes reliability metrics: MTBF, MTTR, and inherent equipment availability.
   *
   * Formula:
   * MTBF = Total Operating Hours / Breakdown Count
   * MTTR = Total Downtime Hours / Breakdown Count
   * Availability = (MTBF / (MTBF + MTTR)) * 100
   */
  static calculateReliabilityMetrics(input: {
    assetId: string;
    totalOperatingHours: number;
    breakdownCount: number;
    totalDowntimeHours: number;
  }): ReliabilityMetrics {
    const { assetId, totalOperatingHours, breakdownCount, totalDowntimeHours } = input;

    const safeCount = Math.max(1, breakdownCount);
    const mtbf = breakdownCount > 0 ? Number((totalOperatingHours / safeCount).toFixed(1)) : totalOperatingHours;
    const mttr = breakdownCount > 0 ? Number((totalDowntimeHours / safeCount).toFixed(1)) : 0;

    const totalCycle = mtbf + mttr;
    const availability =
      totalCycle > 0 ? Number(((mtbf / totalCycle) * 100).toFixed(2)) : 100.0;

    let status: "OPTIMAL" | "ATTENTION_REQUIRED" | "HIGH_MAINTENANCE_BURDEN" = "OPTIMAL";
    if (availability < 80 || mttr > 48) {
      status = "HIGH_MAINTENANCE_BURDEN";
    } else if (availability < 92 || mttr > 18) {
      status = "ATTENTION_REQUIRED";
    }

    return {
      assetId,
      totalOperatingHours,
      breakdownCount,
      totalDowntimeHours,
      mtbfHours: mtbf,
      mttrHours: mttr,
      inherentAvailabilityPercent: availability,
      status,
    };
  }

  /**
   * Closes a maintenance ticket and reconciles spare parts and labor expenditure.
   */
  static finalizeMaintenanceTicket(
    ticket: MaintenanceTicket,
    sparesCost: number,
    labourCost: number,
    resolvedDowntimeHours: number,
  ): MaintenanceTicket {
    const total = Number((sparesCost + labourCost).toFixed(2));
    return {
      ...ticket,
      downtimeHours: resolvedDowntimeHours,
      sparesConsumedCostINR: sparesCost,
      labourCostINR: labourCost,
      totalMaintenanceCostINR: total,
      status: "CLOSED",
    };
  }
}
