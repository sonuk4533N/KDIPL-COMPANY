"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/prisma";
import { AuditAction } from "@/generated/prisma/enums";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hashPassword } from "@/server/auth/password";
import { passwordPolicySchema } from "@/features/auth/password-policy";
import { hashRateLimitKey } from "@/server/auth/rate-limit";
import {
  requestMetadata,
  validateMutationOrigin,
} from "@/server/auth/request-security";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError, toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

const createUserSchema = z.object({
  employeeId: z.string().uuid(),
  email: z.string().trim().email().max(320),
  password: passwordPolicySchema,
  roleIds: z.array(z.string().uuid()).min(1),
});

const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().min(1).max(50),
  fullName: z.string().trim().min(2).max(160),
  designation: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(320).optional(),
  mobile: z.string().trim().max(30).optional(),
  departmentId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
});

const employeeSchema = z.object({
  employeeId: z.string().uuid(),
  employeeCode: z.string().trim().min(1).max(50),
  fullName: z.string().trim().min(2).max(160),
  designation: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(320).optional(),
  mobile: z.string().trim().max(30).optional(),
  departmentId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
});

const roleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Za-z0-9_]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

const passwordSchema = z.object({
  userId: z.string().uuid(),
  password: passwordPolicySchema,
});

const departmentSchema = z.object({
  departmentId: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9_]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

const positionSchema = z.object({
  positionId: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9_]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  departmentId: z.string().uuid().optional(),
});

function formValue(formData: FormData, name: string) {
  return formData.get(name) || undefined;
}

function formIds(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string");
}

async function validateEmployeePlacement(input: {
  employeeId?: string;
  departmentId?: string;
  positionId?: string;
  managerId?: string;
}) {
  const [department, position, manager] = await Promise.all([
    input.departmentId
      ? db.department.findUnique({
          where: { id: input.departmentId },
          select: { id: true, isActive: true },
        })
      : null,
    input.positionId
      ? db.position.findUnique({
          where: { id: input.positionId },
          select: { id: true, isActive: true, departmentId: true },
        })
      : null,
    input.managerId
      ? db.employee.findUnique({
          where: { id: input.managerId },
          select: { id: true, isActive: true, managerId: true },
        })
      : null,
  ]);
  if (input.departmentId && (!department || !department.isActive))
    throw new AppError("VALIDATION_ERROR", "Select an active department.");
  if (input.positionId && (!position || !position.isActive))
    throw new AppError("VALIDATION_ERROR", "Select an active position.");
  if (
    position?.departmentId &&
    input.departmentId &&
    position.departmentId !== input.departmentId
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "The position belongs to a different department.",
    );
  if (input.managerId && (!manager || !manager.isActive))
    throw new AppError("VALIDATION_ERROR", "Select an active manager.");
  if (input.employeeId && manager) {
    const visited = new Set<string>();
    let next: { id: string; managerId: string | null } | null = manager;
    while (next) {
      if (next.id === input.employeeId)
        throw new AppError(
          "CONFLICT",
          "That reporting line would create a management cycle.",
        );
      if (!next.managerId || visited.has(next.managerId)) break;
      visited.add(next.id);
      next = await db.employee.findUnique({
        where: { id: next.managerId },
        select: { id: true, managerId: true },
      });
    }
  }
}

export type UserManagementState = CommandResult | null;

export async function createUserAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const parsed = createUserSchema.safeParse({
      employeeId: formData.get("employeeId"),
      email: formData.get("email"),
      password: formData.get("password"),
      roleIds: Array.from(new Set(formIds(formData, "roleIds"))),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the highlighted information.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    }

    const data = parsed.data;
    const emailNormalized = data.email.toLowerCase();
    const [existingUser, employee, roles] = await Promise.all([
      db.user.findUnique({ where: { emailNormalized }, select: { id: true } }),
      db.employee.findUnique({
        where: { id: data.employeeId },
        select: {
          id: true,
          fullName: true,
          isActive: true,
          user: { select: { id: true } },
        },
      }),
      db.role.findMany({
        where: { id: { in: data.roleIds }, isActive: true },
        select: { id: true, code: true },
      }),
    ]);
    if (existingUser)
      throw new AppError("CONFLICT", "That email is already in use.");
    if (!employee || !employee.isActive)
      throw new AppError("VALIDATION_ERROR", "Select an active employee.");
    if (employee.user)
      throw new AppError(
        "CONFLICT",
        "That employee already has a login account.",
      );
    if (roles.length !== data.roleIds.length)
      throw new AppError("VALIDATION_ERROR", "One or more roles are inactive.");
    if (roles.some((role) => role.code === "SYSTEM_ADMINISTRATOR"))
      requirePermission(principal, "role.manage");

    const metadata = await requestMetadata();
    const passwordHash = await hashPassword(data.password);
    await db.$transaction(async (transaction) => {
      await transaction.employee.update({
        where: { id: employee.id },
        data: { email: data.email },
      });
      const user = await transaction.user.create({
        data: {
          email: data.email,
          emailNormalized,
          passwordHash,
          displayName: employee.fullName,
          employeeId: employee.id,
          mustChangePassword: true,
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        select: { id: true, email: true, displayName: true },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "User",
          entityId: user.id,
          after: {
            email: user.email,
            displayName: user.displayName,
            roles: roles.map((role) => role.code),
          },
          metadata: { ipHash: hashRateLimitKey(metadata.ip) },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function toggleUserStatusAction(
  userId: string,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    if (principal.userId === userId) {
      throw new AppError("CONFLICT", "You cannot disable your own account.");
    }
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        email: true,
        employee: { select: { isActive: true } },
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user) throw new AppError("NOT_FOUND");
    if (user.roles.some(({ role }) => role.code === "SYSTEM_ADMINISTRATOR"))
      requirePermission(principal, "role.manage");
    const nextStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (nextStatus === "ACTIVE" && user.employee && !user.employee.isActive)
      throw new AppError(
        "CONFLICT",
        "Reactivate the employee record before enabling this account.",
      );
    if (
      nextStatus === "DISABLED" &&
      user.roles.some(({ role }) => role.code === "SYSTEM_ADMINISTRATOR")
    ) {
      const administrators = await db.user.count({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { code: "SYSTEM_ADMINISTRATOR" } } },
        },
      });
      if (administrators <= 1)
        throw new AppError(
          "CONFLICT",
          "At least one active system administrator must remain.",
        );
    }
    await db.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { status: nextStatus, authVersion: { increment: 1 } },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "User",
          entityId: user.id,
          before: { status: user.status },
          after: { status: nextStatus, email: user.email },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function updateEmployeeAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const parsed = employeeSchema.safeParse({
      employeeId: formValue(formData, "employeeId"),
      employeeCode: formValue(formData, "employeeCode"),
      fullName: formValue(formData, "fullName"),
      designation: formValue(formData, "designation"),
      email: formValue(formData, "email"),
      mobile: formValue(formData, "mobile"),
      departmentId: formValue(formData, "departmentId"),
      positionId: formValue(formData, "positionId"),
      managerId: formValue(formData, "managerId"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the highlighted information.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    }
    const data = parsed.data;
    if (data.managerId === data.employeeId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "An employee cannot manage themselves.",
      );
    }
    await validateEmployeePlacement(data);
    const employee = await db.employee.findUnique({
      where: { id: data.employeeId },
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        designation: true,
        email: true,
        mobile: true,
        departmentId: true,
        positionId: true,
        managerId: true,
        user: { select: { id: true } },
      },
    });
    if (!employee) throw new AppError("NOT_FOUND");
    const duplicate = await db.employee.findFirst({
      where: { employeeCode: data.employeeCode, NOT: { id: data.employeeId } },
      select: { id: true },
    });
    if (duplicate)
      throw new AppError("CONFLICT", "That employee code is already in use.");
    if (data.email) {
      const duplicateUser = await db.user.findFirst({
        where: {
          emailNormalized: data.email.toLowerCase(),
          ...(employee.user ? { NOT: { id: employee.user.id } } : {}),
        },
        select: { id: true },
      });
      if (duplicateUser)
        throw new AppError(
          "CONFLICT",
          "That email is already assigned to another account.",
        );
    }
    if (data.managerId) {
      const manager = await db.employee.findUnique({
        where: { id: data.managerId },
        select: { id: true, isActive: true },
      });
      if (!manager || !manager.isActive)
        throw new AppError(
          "VALIDATION_ERROR",
          "Please select an active manager.",
        );
    }
    await db.$transaction(async (transaction) => {
      const result = await transaction.employee.update({
        where: { id: employee.id },
        data: {
          employeeCode: data.employeeCode,
          fullName: data.fullName,
          designation: data.designation,
          email: data.email,
          mobile: data.mobile,
          departmentId: data.departmentId,
          positionId: data.positionId,
          managerId: data.managerId,
        },
        select: { id: true, fullName: true, employeeCode: true },
      });
      await transaction.user.updateMany({
        where: { employeeId: employee.id },
        data: {
          displayName: data.fullName,
          email: data.email ?? undefined,
          emailNormalized: data.email?.toLowerCase() ?? undefined,
          authVersion: { increment: 1 },
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "Employee",
          entityId: result.id,
          before: employee,
          after: result,
        },
        transaction,
      );
      return result;
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function createRoleAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "role.manage");
    const parsed = roleSchema.safeParse({
      code: formValue(formData, "code"),
      name: formValue(formData, "name"),
      description: formValue(formData, "description"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the highlighted information.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    }
    const code = parsed.data.code.toUpperCase();
    const existing = await db.role.findFirst({
      where: { OR: [{ code }, { name: parsed.data.name }] },
      select: { id: true },
    });
    if (existing)
      throw new AppError(
        "CONFLICT",
        "That role code or name is already in use.",
      );
    await db.$transaction(async (transaction) => {
      const result = await transaction.role.create({
        data: {
          code,
          name: parsed.data.name,
          description: parsed.data.description,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "Role",
          entityId: result.id,
          after: { code: result.code, name: result.name },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function updateRolePermissionsAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "role.manage");
    const roleId = z.string().uuid().safeParse(formValue(formData, "roleId"));
    const permissionIds = Array.from(
      new Set(formIds(formData, "permissionIds")),
    );
    if (
      !roleId.success ||
      permissionIds.some((id) => !z.string().uuid().safeParse(id).success)
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Please select a valid role and permissions.",
      );
    }
    const role = await db.role.findUnique({
      where: { id: roleId.data },
      select: { id: true, code: true },
    });
    if (!role) throw new AppError("NOT_FOUND");
    const validPermissions = await db.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true, code: true },
    });
    if (validPermissions.length !== permissionIds.length)
      throw new AppError(
        "VALIDATION_ERROR",
        "One or more permissions are invalid.",
      );
    if (role.code === "SYSTEM_ADMINISTRATOR") {
      const required = ["app.access", "user.manage", "role.manage"];
      const selected = new Set(
        validPermissions.map((permission) => permission.code),
      );
      if (required.some((permission) => !selected.has(permission)))
        throw new AppError(
          "CONFLICT",
          "The System Administrator role must retain application, user, and role administration access.",
        );
    }
    await db.$transaction(async (transaction) => {
      await transaction.rolePermission.deleteMany({
        where: { roleId: role.id },
      });
      if (validPermissions.length)
        await transaction.rolePermission.createMany({
          data: validPermissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
        });
      await transaction.user.updateMany({
        where: { roles: { some: { roleId: role.id } } },
        data: { authVersion: { increment: 1 } },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.PERMISSION_CHANGE,
          entityType: "Role",
          entityId: role.id,
          after: {
            role: role.code,
            permissions: validPermissions.map((permission) => permission.code),
          },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function createEmployeeAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const parsed = createEmployeeSchema.safeParse({
      employeeCode: formValue(formData, "employeeCode"),
      fullName: formValue(formData, "fullName"),
      designation: formValue(formData, "designation"),
      email: formValue(formData, "email"),
      mobile: formValue(formData, "mobile"),
      departmentId: formValue(formData, "departmentId"),
      positionId: formValue(formData, "positionId"),
      managerId: formValue(formData, "managerId"),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the employee information.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    const data = parsed.data;
    await validateEmployeePlacement(data);
    const duplicate = await db.employee.findUnique({
      where: { employeeCode: data.employeeCode },
      select: { id: true },
    });
    if (duplicate)
      throw new AppError("CONFLICT", "That employee code is already in use.");
    await db.$transaction(async (transaction) => {
      const employee = await transaction.employee.create({ data });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "Employee",
          entityId: employee.id,
          after: {
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
          },
        },
        transaction,
      );
      return employee;
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function updateRoleAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "role.manage");
    const parsed = roleSchema.extend({ roleId: z.string().uuid() }).safeParse({
      roleId: formValue(formData, "roleId"),
      code: formValue(formData, "code"),
      name: formValue(formData, "name"),
      description: formValue(formData, "description"),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the role information.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    await db.$transaction(async (transaction) => {
      const before = await transaction.role.findUnique({
        where: { id: parsed.data.roleId },
      });
      if (!before) throw new AppError("NOT_FOUND");
      if (before.isSystem && parsed.data.code.toUpperCase() !== before.code)
        throw new AppError(
          "CONFLICT",
          "KDIPL system role codes cannot be changed.",
        );
      const result = await transaction.role.update({
        where: { id: before.id },
        data: {
          code: parsed.data.code.toUpperCase(),
          name: parsed.data.name,
          description: parsed.data.description,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "Role",
          entityId: result.id,
          before,
          after: result,
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function toggleRoleStatusAction(
  roleId: string,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "role.manage");
    const role = await db.role.findUnique({
      where: { id: z.string().uuid().parse(roleId) },
      select: {
        id: true,
        code: true,
        name: true,
        isSystem: true,
        isActive: true,
      },
    });
    if (!role) throw new AppError("NOT_FOUND");
    if (role.isSystem)
      throw new AppError(
        "CONFLICT",
        "KDIPL system roles cannot be deactivated.",
      );
    await db.$transaction(async (transaction) => {
      await transaction.role.update({
        where: { id: role.id },
        data: { isActive: !role.isActive },
      });
      await transaction.user.updateMany({
        where: { roles: { some: { roleId: role.id } } },
        data: { authVersion: { increment: 1 } },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "Role",
          entityId: role.id,
          before: { isActive: role.isActive },
          after: { isActive: !role.isActive, code: role.code },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function toggleDepartmentStatusAction(
  departmentId: string,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const department = await db.department.findUnique({
      where: { id: z.string().uuid().parse(departmentId) },
      select: { id: true, code: true, isActive: true },
    });
    if (!department) throw new AppError("NOT_FOUND");
    await db.$transaction(async (transaction) => {
      await transaction.department.update({
        where: { id: department.id },
        data: { isActive: !department.isActive },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "Department",
          entityId: department.id,
          before: { isActive: department.isActive },
          after: { isActive: !department.isActive, code: department.code },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function togglePositionStatusAction(
  positionId: string,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const position = await db.position.findUnique({
      where: { id: z.string().uuid().parse(positionId) },
      select: { id: true, code: true, isActive: true },
    });
    if (!position) throw new AppError("NOT_FOUND");
    await db.$transaction(async (transaction) => {
      await transaction.position.update({
        where: { id: position.id },
        data: { isActive: !position.isActive },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "Position",
          entityId: position.id,
          before: { isActive: position.isActive },
          after: { isActive: !position.isActive, code: position.code },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function toggleEmployeeStatusAction(
  employeeId: string,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const employee = await db.employee.findUnique({
      where: { id: z.string().uuid().parse(employeeId) },
      select: {
        id: true,
        fullName: true,
        isActive: true,
        user: { select: { id: true } },
      },
    });
    if (!employee) throw new AppError("NOT_FOUND");
    await db.$transaction(async (transaction) => {
      await transaction.employee.update({
        where: { id: employee.id },
        data: { isActive: !employee.isActive },
      });
      if (employee.isActive && employee.user) {
        await transaction.user.update({
          where: { id: employee.user.id },
          data: { status: "DISABLED", authVersion: { increment: 1 } },
        });
      }
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "Employee",
          entityId: employee.id,
          before: { isActive: employee.isActive },
          after: { isActive: !employee.isActive, fullName: employee.fullName },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function saveDepartmentAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const parsed = departmentSchema.safeParse({
      departmentId: formValue(formData, "departmentId"),
      code: formValue(formData, "code"),
      name: formValue(formData, "name"),
      description: formValue(formData, "description"),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the department information.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    const data = { ...parsed.data, code: parsed.data.code.toUpperCase() };
    await db.$transaction(async (transaction) => {
      const before = data.departmentId
        ? await transaction.department.findUnique({
            where: { id: data.departmentId },
          })
        : null;
      const department = data.departmentId
        ? await transaction.department.update({
            where: { id: data.departmentId },
            data: {
              code: data.code,
              name: data.name,
              description: data.description,
            },
          })
        : await transaction.department.create({
            data: {
              code: data.code,
              name: data.name,
              description: data.description,
            },
          });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "Department",
          entityId: department.id,
          before,
          after: department,
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function savePositionAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const parsed = positionSchema.safeParse({
      positionId: formValue(formData, "positionId"),
      code: formValue(formData, "code"),
      name: formValue(formData, "name"),
      description: formValue(formData, "description"),
      departmentId: formValue(formData, "departmentId"),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the position information.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    const data = { ...parsed.data, code: parsed.data.code.toUpperCase() };
    await db.$transaction(async (transaction) => {
      const before = data.positionId
        ? await transaction.position.findUnique({
            where: { id: data.positionId },
          })
        : null;
      const values = {
        code: data.code,
        name: data.name,
        description: data.description,
        departmentId: data.departmentId,
      };
      const position = data.positionId
        ? await transaction.position.update({
            where: { id: data.positionId },
            data: values,
          })
        : await transaction.position.create({ data: values });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "Position",
          entityId: position.id,
          before,
          after: position,
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function assignUserRolesAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const userId = z.string().uuid().safeParse(formValue(formData, "userId"));
    const roleIds = Array.from(new Set(formIds(formData, "roleIds")));
    if (
      !userId.success ||
      !roleIds.length ||
      roleIds.some((id) => !z.string().uuid().safeParse(id).success)
    )
      throw new AppError("VALIDATION_ERROR", "Select at least one valid role.");
    const [user, roles] = await Promise.all([
      db.user.findUnique({
        where: { id: userId.data },
        select: {
          id: true,
          displayName: true,
          roles: { select: { role: { select: { code: true } } } },
        },
      }),
      db.role.findMany({
        where: { id: { in: roleIds }, isActive: true },
        select: { id: true, code: true },
      }),
    ]);
    if (!user) throw new AppError("NOT_FOUND");
    if (user.id === principal.userId)
      throw new AppError(
        "CONFLICT",
        "You cannot change your own role assignments.",
      );
    if (roles.length !== roleIds.length)
      throw new AppError(
        "VALIDATION_ERROR",
        "One or more selected roles are inactive.",
      );
    if (
      roles.some((role) => role.code === "SYSTEM_ADMINISTRATOR") ||
      user.roles.some(({ role }) => role.code === "SYSTEM_ADMINISTRATOR")
    )
      requirePermission(principal, "role.manage");
    const removingSystemAdministrator =
      user.roles.some(({ role }) => role.code === "SYSTEM_ADMINISTRATOR") &&
      !roles.some((role) => role.code === "SYSTEM_ADMINISTRATOR");
    if (removingSystemAdministrator) {
      const administrators = await db.user.count({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { code: "SYSTEM_ADMINISTRATOR" } } },
        },
      });
      if (administrators <= 1)
        throw new AppError(
          "CONFLICT",
          "At least one active system administrator must remain.",
        );
    }
    await db.$transaction(async (transaction) => {
      await transaction.userRole.deleteMany({ where: { userId: user.id } });
      await transaction.userRole.createMany({
        data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
      });
      await transaction.user.update({
        where: { id: user.id },
        data: { authVersion: { increment: 1 } },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.PERMISSION_CHANGE,
          entityType: "User",
          entityId: user.id,
          after: {
            displayName: user.displayName,
            roles: roles.map((role) => role.code),
          },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function resetUserPasswordAction(
  _previous: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "user.manage");
    const parsed = passwordSchema.safeParse({
      userId: formValue(formData, "userId"),
      password: formValue(formData, "password"),
    });
    if (!parsed.success)
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The password must be at least 12 characters.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    const user = await db.user.findUnique({
      where: { id: parsed.data.userId },
      select: {
        id: true,
        email: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user) throw new AppError("NOT_FOUND");
    if (user.roles.some(({ role }) => role.code === "SYSTEM_ADMINISTRATOR"))
      requirePermission(principal, "role.manage");
    if (user.id === principal.userId)
      throw new AppError(
        "CONFLICT",
        "Use Security & sessions to change your own password.",
      );
    const passwordHash = await hashPassword(parsed.data.password);
    await db.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: null,
          authVersion: { increment: 1 },
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "User",
          entityId: user.id,
          after: { email: user.email, passwordReset: true },
        },
        transaction,
      );
    });
    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}
