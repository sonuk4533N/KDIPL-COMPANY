import { Building2, KeyRound, ShieldCheck, Users } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ApplicationState } from "@/components/ui/states";
import { Card, CardContent } from "@/components/ui/card";
import { EmployeeManagement } from "@/features/administration/employee-management";
import { OrganizationManagement } from "@/features/administration/organization-management";
import { RoleManagement } from "@/features/administration/role-management";
import { UserManagement } from "@/features/administration/user-management";
import { db } from "@/db/prisma";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function AdministrationPage() {
  const principal = await getCurrentPrincipal();
  const canManageUsers = hasPermission(principal, "user.manage");
  const canManageRoles = hasPermission(principal, "role.manage");
  if (!principal || (!canManageUsers && !canManageRoles))
    return (
      <ApplicationState
        kind="forbidden"
        title="Administration access required"
        description="You do not have permission to manage users or roles. Contact a system administrator if your responsibilities have changed."
      />
    );

  const [users, employees, departments, positions, roles, permissions] =
    await Promise.all([
      db.user.findMany({
        orderBy: { displayName: "asc" },
        select: {
          id: true,
          displayName: true,
          email: true,
          status: true,
          mustChangePassword: true,
          lastLoginAt: true,
          employee: {
            select: {
              employeeCode: true,
              department: { select: { name: true } },
            },
          },
          roles: {
            orderBy: { role: { name: "asc" } },
            select: { role: { select: { id: true, name: true } } },
          },
        },
      }),
      db.employee.findMany({
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          designation: true,
          email: true,
          mobile: true,
          isActive: true,
          departmentId: true,
          positionId: true,
          managerId: true,
          user: { select: { id: true } },
        },
      }),
      db.department.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isActive: true,
          _count: { select: { employees: true, positions: true } },
        },
      }),
      db.position.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isActive: true,
          departmentId: true,
          _count: { select: { employees: true } },
        },
      }),
      db.role.findMany({
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isSystem: true,
          isActive: true,
          permissions: { select: { permissionId: true } },
          _count: { select: { users: true } },
        },
      }),
      db.permission.findMany({
        orderBy: { code: "asc" },
        select: { id: true, code: true, description: true },
      }),
    ]);

  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;
  const activeEmployees = employees.filter(
    (employee) => employee.isActive,
  ).length;
  const activeRoles = roles.filter((role) => role.isActive).length;
  const metrics = [
    { label: "Active users", value: activeUsers, icon: Users },
    { label: "Active employees", value: activeEmployees, icon: ShieldCheck },
    { label: "Departments", value: departments.length, icon: Building2 },
    { label: "Active roles", value: activeRoles, icon: KeyRound },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Phase 1 · Identity & access"
        title="Administration"
        description="Maintain KDIPL employees, organization structure, login accounts, roles, and permission assignments."
      />
      <nav
        aria-label="Administration sections"
        className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2"
      >
        {[
          ["Users", "#users"],
          ["Employees", "#employees"],
          ["Organization", "#organization"],
          ["Roles & permissions", "#roles"],
        ].map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4">
              <span className="grid size-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="font-display text-2xl font-bold text-slate-950">
                  {value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {canManageUsers ? (
        <section id="users" className="scroll-mt-28">
          <UserManagement
            currentUserId={principal.userId}
            users={users.map((user) => ({
              id: user.id,
              displayName: user.displayName,
              email: user.email,
              employeeCode: user.employee?.employeeCode ?? "Unlinked",
              department: user.employee?.department?.name ?? "Unassigned",
              roles: user.roles.map(({ role }) => role),
              status: user.status,
              mustChangePassword: user.mustChangePassword,
              lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
            }))}
            availableEmployees={employees
              .filter((employee) => employee.isActive && !employee.user)
              .map((employee) => ({
                id: employee.id,
                name: `${employee.fullName} · ${employee.employeeCode}`,
                email: employee.email ?? "",
              }))}
            roles={roles
              .filter((role) => role.isActive)
              .map((role) => ({ id: role.id, name: role.name }))}
          />
        </section>
      ) : null}
      {canManageUsers ? (
        <section id="employees" className="scroll-mt-28">
          <EmployeeManagement
            employees={employees.map((employee) => ({
              id: employee.id,
              employeeCode: employee.employeeCode,
              fullName: employee.fullName,
              designation: employee.designation ?? "",
              email: employee.email ?? "",
              mobile: employee.mobile ?? "",
              isActive: employee.isActive,
              departmentId: employee.departmentId ?? "",
              positionId: employee.positionId ?? "",
              managerId: employee.managerId ?? "",
              hasUser: Boolean(employee.user),
            }))}
            departments={departments.map((department) => ({
              id: department.id,
              name: department.name,
              active: department.isActive,
            }))}
            positions={positions.map((position) => ({
              id: position.id,
              name: position.name,
              active: position.isActive,
            }))}
          />
        </section>
      ) : null}
      {canManageUsers ? (
        <section id="organization" className="scroll-mt-28">
          <OrganizationManagement
            departments={departments.map((department) => ({
              id: department.id,
              code: department.code,
              name: department.name,
              description: department.description ?? "",
              isActive: department.isActive,
              employeeCount: department._count.employees,
              positionCount: department._count.positions,
            }))}
            positions={positions.map((position) => ({
              id: position.id,
              code: position.code,
              name: position.name,
              description: position.description ?? "",
              isActive: position.isActive,
              departmentId: position.departmentId ?? "",
              employeeCount: position._count.employees,
            }))}
          />
        </section>
      ) : null}
      {canManageRoles ? (
        <section id="roles" className="scroll-mt-28">
          <RoleManagement
            roles={roles.map((role) => ({
              id: role.id,
              code: role.code,
              name: role.name,
              description: role.description ?? "",
              isSystem: role.isSystem,
              isActive: role.isActive,
              userCount: role._count.users,
              permissionIds: role.permissions.map(
                (permission) => permission.permissionId,
              ),
            }))}
            permissions={permissions.map((permission) => ({
              id: permission.id,
              code: permission.code,
              description: permission.description ?? "",
            }))}
          />
        </section>
      ) : null}
    </div>
  );
}
