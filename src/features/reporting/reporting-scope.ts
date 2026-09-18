import "server-only";

import { db } from "@/db/prisma";
import type { AuthenticatedPrincipal } from "@/types/application";

const companyWideRoles = new Set([
  "MANAGING_DIRECTOR",
  "PROJECT_DIRECTOR",
  "ACCOUNTS",
  "ACCOUNTS_ADMIN",
  "SYSTEM_ADMINISTRATOR",
]);

export type ReportingScope = {
  companyWide: boolean;
  projectIds: string[] | null;
  siteIds: string[] | null;
  locationIds: string[] | null;
};

export async function getReportingScope(
  principal: AuthenticatedPrincipal,
): Promise<ReportingScope> {
  const companyWide = principal.roleCodes.some((role) =>
    companyWideRoles.has(role),
  );
  const procurementWide = principal.roleCodes.includes("PURCHASE_MANAGER");
  const businessWide = principal.roleCodes.includes(
    "BUSINESS_DEVELOPMENT_DIRECTOR",
  );
  if (companyWide || procurementWide || businessWide)
    return {
      companyWide: true,
      projectIds: null,
      siteIds: null,
      locationIds: null,
    };
  if (!principal.employeeId)
    return { companyWide: false, projectIds: [], siteIds: [], locationIds: [] };

  const [projectAssignments, siteAssignments, locationAccess] =
    await Promise.all([
      db.projectAssignment.findMany({
        where: { employeeId: principal.employeeId, isActive: true },
        select: { projectId: true },
      }),
      db.siteAssignment.findMany({
        where: { employeeId: principal.employeeId, isActive: true },
        select: { siteId: true, site: { select: { projectId: true } } },
      }),
      db.inventoryLocationAccess.findMany({
        where: { employeeId: principal.employeeId, isActive: true },
        select: { locationId: true },
      }),
    ]);
  const projectIds = [
    ...new Set([
      ...projectAssignments.map((row) => row.projectId),
      ...siteAssignments.map((row) => row.site.projectId),
    ]),
  ];
  const siteIds = siteAssignments.map((row) => row.siteId);
  let locationIds = locationAccess.map((row) => row.locationId);
  if (!locationIds.length && (projectIds.length || siteIds.length)) {
    const rows = await db.inventoryLocation.findMany({
      where: {
        OR: [{ projectId: { in: projectIds } }, { siteId: { in: siteIds } }],
      },
      select: { id: true },
    });
    locationIds = rows.map((row) => row.id);
  }
  return { companyWide: false, projectIds, siteIds, locationIds };
}

export function scopedId(ids: string[] | null | undefined) {
  return ids === null ? undefined : { in: ids ?? [] };
}
