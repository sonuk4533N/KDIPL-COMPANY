"use client";

import { useActionState, useEffect } from "react";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  assignUserRolesAction,
  createUserAction,
  resetUserPasswordAction,
  toggleUserStatusAction,
} from "@/features/administration/user-actions";

type Option = { id: string; name: string };
type EmployeeOption = Option & { email: string };
type UserRow = {
  id: string;
  displayName: string;
  email: string;
  employeeCode: string;
  department: string;
  roles: Option[];
  status: "ACTIVE" | "DISABLED";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

function StatusAction({ user }: { user: UserRow }) {
  const [state, action, pending] = useActionState(
    async () => toggleUserStatusAction(user.id),
    null,
  );
  useEffect(() => {
    if (state && !state.ok) window.alert(state.error.message);
  }, [state]);
  return (
    <form action={action}>
      <Button type="submit" size="sm" variant="tertiary" disabled={pending}>
        {pending
          ? "Saving..."
          : user.status === "ACTIVE"
            ? "Disable account"
            : "Enable account"}
      </Button>
    </form>
  );
}

function AccessEditor({ user, roles }: { user: UserRow; roles: Option[] }) {
  const [roleState, roleAction, rolePending] = useActionState(
    assignUserRolesAction,
    null,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    resetUserPasswordAction,
    null,
  );
  const selected = new Set(user.roles.map((role) => role.id));
  return (
    <details className="w-72 max-w-[80vw] rounded-lg border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-blue-700">
        Manage access
      </summary>
      <div className="mt-4 space-y-5">
        <form action={roleAction} className="space-y-3">
          <input type="hidden" name="userId" value={user.id} />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Assigned roles
          </p>
          <div className="space-y-2">
            {roles.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="roleIds"
                  value={role.id}
                  defaultChecked={selected.has(role.id)}
                />
                {role.name}
              </label>
            ))}
          </div>
          <Button type="submit" size="sm" disabled={rolePending}>
            <ShieldCheck className="size-4" />
            {rolePending ? "Saving..." : "Save roles"}
          </Button>
          {roleState && !roleState.ok ? (
            <Alert variant="error">{roleState.error.message}</Alert>
          ) : null}
          {roleState?.ok ? (
            <Alert variant="success">Role assignments saved.</Alert>
          ) : null}
        </form>
        <form
          action={passwordAction}
          className="space-y-3 border-t border-slate-100 pt-4"
        >
          <input type="hidden" name="userId" value={user.id} />
          <Field
            label="Temporary password"
            htmlFor={`password-${user.id}`}
            hint="User must replace it at next sign-in"
            error={
              passwordState && !passwordState.ok
                ? passwordState.error.fields?.password?.[0]
                : undefined
            }
          >
            <Input
              id={`password-${user.id}`}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </Field>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={passwordPending}
          >
            <KeyRound className="size-4" />
            {passwordPending ? "Resetting..." : "Reset password"}
          </Button>
          {passwordState && !passwordState.ok ? (
            <Alert variant="error">{passwordState.error.message}</Alert>
          ) : null}
          {passwordState?.ok ? (
            <Alert variant="success">Temporary password assigned.</Alert>
          ) : null}
        </form>
      </div>
    </details>
  );
}

export function UserManagement({
  currentUserId,
  users,
  availableEmployees,
  roles,
}: {
  currentUserId: string;
  users: UserRow[];
  availableEmployees: EmployeeOption[];
  roles: Option[];
}) {
  const [state, action, pending] = useActionState(createUserAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <UserPlus className="size-4 text-blue-700" />
            Create login account
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Link an active employee to an individual account and one or more
            roles. Temporary credentials require an immediate password change.
          </p>
        </CardHeader>
        <CardContent>
          {state && !state.ok ? (
            <div className="mb-4">
              <Alert variant="error">{state.error.message}</Alert>
            </div>
          ) : null}
          {state?.ok ? (
            <div className="mb-4">
              <Alert variant="success">Login account created.</Alert>
            </div>
          ) : null}
          <form action={action} className="grid gap-4 lg:grid-cols-3">
            <Field
              label="Employee"
              htmlFor="employeeId"
              error={fields?.employeeId?.[0]}
            >
              <Select id="employeeId" name="employeeId" required>
                <option value="">Select employee</option>
                {availableEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Work email"
              htmlFor="email"
              error={fields?.email?.[0]}
            >
              <Input id="email" name="email" type="email" required />
            </Field>
            <Field
              label="Temporary password"
              htmlFor="password"
              hint="12+ characters with uppercase, lowercase, number, and symbol"
              error={fields?.password?.[0]}
            >
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </Field>
            <fieldset className="lg:col-span-3">
              <legend className="mb-2 text-sm font-semibold text-slate-700">
                Initial roles
              </legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                  >
                    <input type="checkbox" name="roleIds" value={role.id} />
                    {role.name}
                  </label>
                ))}
              </div>
              {fields?.roleIds?.[0] ? (
                <p className="mt-1 text-xs text-red-700">{fields.roleIds[0]}</p>
              ) : null}
            </fieldset>
            <div className="lg:col-span-3">
              <Button
                type="submit"
                disabled={pending || !availableEmployees.length}
              >
                <UserPlus className="size-4" />
                {pending ? "Creating..." : "Create login account"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-display text-lg font-bold text-slate-950">
            User accounts
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review status, recent login, roles, and credential lifecycle.
          </p>
        </CardHeader>
        <TableContainer className="rounded-none border-0 border-t border-slate-100">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="font-semibold text-slate-950">
                      {user.displayName}
                      {user.id === currentUserId ? " · You" : ""}
                    </p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                    <p className="text-xs text-slate-500">
                      {user.employeeCode} · {user.department}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <span
                          key={role.id}
                          className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                        >
                          {role.name}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <StatusBadge
                        status={
                          user.status === "ACTIVE" ? "Active" : "Disabled"
                        }
                      />
                      {user.mustChangePassword ? (
                        <p className="text-xs font-semibold text-amber-700">
                          Password change required
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-2">
                      {user.id !== currentUserId ? (
                        <StatusAction user={user} />
                      ) : null}
                      {user.id !== currentUserId ? (
                        <AccessEditor user={user} roles={roles} />
                      ) : (
                        <p className="text-xs text-slate-500">
                          Manage your password from Security & sessions.
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      </Card>
    </div>
  );
}
