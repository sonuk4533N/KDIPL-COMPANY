export const permissionCodes = [
  "app.access",
  "project.view",
  "project.create",
  "project.update",
  "material_requirement.view",
  "material_requirement.create",
  "material_requirement.approve",
  "purchase.view",
  "purchase.create",
  "purchase.approve",
  "inventory.view",
  "inventory.receive",
  "inventory.issue",
  "inventory.transfer",
  "inventory.adjust",
  "invoice.view",
  "invoice.verify",
  "report.view",
  "report.export",
  "notification.view",
  "audit.view",
  "user.manage",
  "role.manage",
] as const;

export type PermissionCode = (typeof permissionCodes)[number];

export interface AuthenticatedPrincipal {
  userId: string;
  displayName: string;
  email: string;
  employeeId: string | null;
  mustChangePassword: boolean;
  roleCodes: readonly string[];
  permissions: readonly PermissionCode[];
}

export interface AppSession {
  id: string;
  principal: AuthenticatedPrincipal;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
}

export const appErrorCodes = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INSUFFICIENT_STOCK",
  "INVALID_STATUS_TRANSITION",
  "DUPLICATE_TRANSACTION",
  "FILE_UPLOAD_ERROR",
  "INTERNAL_ERROR",
] as const;

export type AppErrorCode = (typeof appErrorCodes)[number];

export type CommandResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: AppErrorCode;
        message: string;
        fields?: Record<string, string[]>;
      };
    };
