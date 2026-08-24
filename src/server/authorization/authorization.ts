import type {
  AuthenticatedPrincipal,
  PermissionCode,
} from "@/types/application";
import { db } from "@/db/prisma";
import { AppError } from "@/server/errors/app-error";

export function hasPermission(
  principal: AuthenticatedPrincipal | null | undefined,
  permission: PermissionCode,
): boolean {
  return Boolean(principal?.permissions.includes(permission));
}

export function requirePermission(
  principal: AuthenticatedPrincipal | null | undefined,
  permission: PermissionCode,
): asserts principal is AuthenticatedPrincipal {
  if (!principal) throw new AppError("UNAUTHORIZED");
  if (!hasPermission(principal, permission)) throw new AppError("FORBIDDEN");
}

export async function canAccessProject(
  principal: AuthenticatedPrincipal | null | undefined,
  projectId: string,
): Promise<boolean> {
  if (!principal) return false;
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) return true;
  if (!hasPermission(principal, "project.view") || !principal.employeeId)
    return false;
  return Boolean(
    await db.project.findFirst({
      where: {
        id: projectId,
        OR: [
          {
            assignments: {
              some: { employeeId: principal.employeeId, isActive: true },
            },
          },
          {
            sites: {
              some: {
                assignments: {
                  some: { employeeId: principal.employeeId, isActive: true },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    }),
  );
}

export async function canAccessSite(
  principal: AuthenticatedPrincipal | null | undefined,
  siteId: string,
): Promise<boolean> {
  if (!principal) return false;
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) return true;
  if (!hasPermission(principal, "site.view") || !principal.employeeId)
    return false;
  return Boolean(
    await db.site.findFirst({
      where: {
        id: siteId,
        OR: [
          {
            assignments: {
              some: { employeeId: principal.employeeId, isActive: true },
            },
          },
          {
            project: {
              assignments: {
                some: { employeeId: principal.employeeId, isActive: true },
              },
            },
          },
        ],
      },
      select: { id: true },
    }),
  );
}

export const AuthorizationService = {
  hasPermission,
  requirePermission,
  canAccessProject,
  canAccessSite,
};
