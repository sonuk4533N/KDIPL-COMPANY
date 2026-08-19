import type {
  AuthenticatedPrincipal,
  PermissionCode,
} from "@/types/application";
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

export function canAccessProject(
  principal: AuthenticatedPrincipal | null | undefined,
  _projectId: string,
): boolean {
  void _projectId;
  if (!principal) return false;
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) return true;
  return false;
}

export function canAccessSite(
  principal: AuthenticatedPrincipal | null | undefined,
  _siteId: string,
): boolean {
  void _siteId;
  if (!principal) return false;
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) return true;
  return false;
}

export const AuthorizationService = {
  hasPermission,
  requirePermission,
  canAccessProject,
  canAccessSite,
};
