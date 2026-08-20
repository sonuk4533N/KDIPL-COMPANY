"use client";

import { useActionState, useEffect } from "react";
import { KeyRound, Plus, Save } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createRoleAction,
  toggleRoleStatusAction,
  updateRoleAction,
  updateRolePermissionsAction,
} from "@/features/administration/user-actions";

type Role = {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  permissionIds: string[];
};
type Permission = { id: string; code: string; description: string };

function RoleEditor({
  role,
  permissions,
}: {
  role: Role;
  permissions: Permission[];
}) {
  const [metadataState, metadataAction, metadataPending] = useActionState(
    updateRoleAction,
    null,
  );
  const [permissionState, permissionAction, permissionPending] = useActionState(
    updateRolePermissionsAction,
    null,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    async () => toggleRoleStatusAction(role.id),
    null,
  );
  useEffect(() => {
    if (toggleState && !toggleState.ok) window.alert(toggleState.error.message);
  }, [toggleState]);
  const metadataFields =
    metadataState && !metadataState.ok ? metadataState.error.fields : undefined;
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-950">{role.name}</p>
              {role.isSystem ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  KDIPL role
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">
              {role.code} · {role.userCount} users · {role.permissionIds.length}{" "}
              permissions
            </p>
          </div>
          <StatusBadge status={role.isActive ? "Active" : "Disabled"} />
        </div>
      </summary>
      <div className="mt-5 space-y-6">
        <form action={metadataAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="roleId" value={role.id} />
          <Field
            label="Role code"
            htmlFor={`role-code-${role.id}`}
            error={metadataFields?.code?.[0]}
          >
            <Input
              id={`role-code-${role.id}`}
              name="code"
              defaultValue={role.code}
              readOnly={role.isSystem}
              required
            />
          </Field>
          <Field
            label="Role name"
            htmlFor={`role-name-${role.id}`}
            error={metadataFields?.name?.[0]}
          >
            <Input
              id={`role-name-${role.id}`}
              name="name"
              defaultValue={role.name}
              required
            />
          </Field>
          <Field
            label="Description"
            htmlFor={`role-description-${role.id}`}
            error={metadataFields?.description?.[0]}
          >
            <Textarea
              id={`role-description-${role.id}`}
              name="description"
              defaultValue={role.description}
            />
          </Field>
          <div className="flex items-end gap-3">
            <Button type="submit" size="sm" disabled={metadataPending}>
              <Save className="size-4" />
              {metadataPending ? "Saving..." : "Save role"}
            </Button>
            {metadataState?.ok ? (
              <span className="text-sm text-emerald-700">Saved</span>
            ) : null}
          </div>
          {metadataState && !metadataState.ok ? (
            <div className="md:col-span-2">
              <Alert variant="error">{metadataState.error.message}</Alert>
            </div>
          ) : null}
        </form>
        <form
          action={permissionAction}
          className="space-y-4 border-t border-slate-100 pt-5"
        >
          <input type="hidden" name="roleId" value={role.id} />
          <div>
            <h3 className="font-semibold text-slate-900">Permission grants</h3>
            <p className="text-xs text-slate-500">
              Saving permission changes invalidates sessions for assigned users.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {permissions.map((permission) => (
              <label
                key={permission.id}
                className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  name="permissionIds"
                  value={permission.id}
                  defaultChecked={role.permissionIds.includes(permission.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-slate-800">
                    {permission.code}
                  </span>
                  <span className="text-xs text-slate-500">
                    {permission.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={permissionPending}>
              <KeyRound className="size-4" />
              {permissionPending ? "Saving..." : "Save permissions"}
            </Button>
            {permissionState?.ok ? (
              <span className="text-sm text-emerald-700">Saved</span>
            ) : null}
          </div>
          {permissionState && !permissionState.ok ? (
            <Alert variant="error">{permissionState.error.message}</Alert>
          ) : null}
        </form>
        {!role.isSystem ? (
          <form
            action={toggleAction}
            className="border-t border-slate-100 pt-4"
          >
            <Button
              type="submit"
              size="sm"
              variant="tertiary"
              disabled={togglePending}
            >
              {togglePending
                ? "Saving..."
                : role.isActive
                  ? "Deactivate role"
                  : "Reactivate role"}
            </Button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

export function RoleManagement({
  roles,
  permissions,
}: {
  roles: Role[];
  permissions: Permission[];
}) {
  const [state, action, pending] = useActionState(createRoleAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Plus className="size-4 text-blue-700" /> Create custom role
          </div>
          <p className="mt-1 text-sm text-slate-500">
            The nine KDIPL roles are protected; additional responsibilities can
            use custom roles.
          </p>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4 md:grid-cols-3">
            <Field
              label="Role code"
              htmlFor="new-role-code"
              error={fields?.code?.[0]}
            >
              <Input
                id="new-role-code"
                name="code"
                placeholder="QUALITY_REVIEWER"
                required
              />
            </Field>
            <Field
              label="Role name"
              htmlFor="new-role-name"
              error={fields?.name?.[0]}
            >
              <Input id="new-role-name" name="name" required />
            </Field>
            <Field
              label="Description"
              htmlFor="new-role-description"
              error={fields?.description?.[0]}
            >
              <Textarea id="new-role-description" name="description" />
            </Field>
            <div className="md:col-span-3">
              <Button type="submit" disabled={pending}>
                <Plus className="size-4" />
                {pending ? "Creating..." : "Create role"}
              </Button>
            </div>
            {state && !state.ok ? (
              <div className="md:col-span-3">
                <Alert variant="error">{state.error.message}</Alert>
              </div>
            ) : null}
            {state?.ok ? (
              <div className="md:col-span-3">
                <Alert variant="success">Role created.</Alert>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Roles & permissions
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Permission definitions remain code-controlled; administrators manage
            role grants here.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {roles.map((role) => (
            <RoleEditor key={role.id} role={role} permissions={permissions} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
