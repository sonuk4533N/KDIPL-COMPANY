"use client";

import { useActionState, useEffect } from "react";
import { Building2, BriefcaseBusiness, Plus, Save } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  saveDepartmentAction,
  savePositionAction,
  toggleDepartmentStatusAction,
  togglePositionStatusAction,
} from "@/features/administration/user-actions";

type Department = {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  employeeCount: number;
  positionCount: number;
};
type Position = {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  departmentId: string;
  employeeCount: number;
};

function ToggleButton({
  kind,
  id,
  active,
}: {
  kind: "department" | "position";
  id: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState(
    async () =>
      kind === "department"
        ? toggleDepartmentStatusAction(id)
        : togglePositionStatusAction(id),
    null,
  );
  useEffect(() => {
    if (state && !state.ok) window.alert(state.error.message);
  }, [state]);
  return (
    <form action={action}>
      <Button type="submit" size="sm" variant="tertiary" disabled={pending}>
        {pending ? "Saving..." : active ? "Deactivate" : "Reactivate"}
      </Button>
    </form>
  );
}

function DepartmentForm({ department }: { department?: Department }) {
  const [state, action, pending] = useActionState(saveDepartmentAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {department ? (
        <input type="hidden" name="departmentId" value={department.id} />
      ) : null}
      <Field
        label="Department code"
        htmlFor={`department-code-${department?.id ?? "new"}`}
        error={fields?.code?.[0]}
      >
        <Input
          id={`department-code-${department?.id ?? "new"}`}
          name="code"
          defaultValue={department?.code}
          placeholder="QUALITY_ASSURANCE"
          required
        />
      </Field>
      <Field
        label="Department name"
        htmlFor={`department-name-${department?.id ?? "new"}`}
        error={fields?.name?.[0]}
      >
        <Input
          id={`department-name-${department?.id ?? "new"}`}
          name="name"
          defaultValue={department?.name}
          required
        />
      </Field>
      <Field
        label="Description"
        htmlFor={`department-description-${department?.id ?? "new"}`}
        error={fields?.description?.[0]}
      >
        <Textarea
          id={`department-description-${department?.id ?? "new"}`}
          name="description"
          defaultValue={department?.description}
          className="md:col-span-2"
        />
      </Field>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {department ? (
            <Save className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {pending
            ? "Saving..."
            : department
              ? "Save department"
              : "Create department"}
        </Button>
        {state?.ok ? (
          <span className="text-sm text-emerald-700">Saved</span>
        ) : null}
      </div>
      {state && !state.ok ? (
        <div className="md:col-span-2">
          <Alert variant="error">{state.error.message}</Alert>
        </div>
      ) : null}
    </form>
  );
}

function PositionForm({
  position,
  departments,
}: {
  position?: Position;
  departments: Department[];
}) {
  const [state, action, pending] = useActionState(savePositionAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {position ? (
        <input type="hidden" name="positionId" value={position.id} />
      ) : null}
      <Field
        label="Position code"
        htmlFor={`position-code-${position?.id ?? "new"}`}
        error={fields?.code?.[0]}
      >
        <Input
          id={`position-code-${position?.id ?? "new"}`}
          name="code"
          defaultValue={position?.code}
          placeholder="QUALITY_MANAGER"
          required
        />
      </Field>
      <Field
        label="Position name"
        htmlFor={`position-name-${position?.id ?? "new"}`}
        error={fields?.name?.[0]}
      >
        <Input
          id={`position-name-${position?.id ?? "new"}`}
          name="name"
          defaultValue={position?.name}
          required
        />
      </Field>
      <Field
        label="Department"
        htmlFor={`position-department-${position?.id ?? "new"}`}
        error={fields?.departmentId?.[0]}
      >
        <Select
          id={`position-department-${position?.id ?? "new"}`}
          name="departmentId"
          defaultValue={position?.departmentId}
        >
          <option value="">No department</option>
          {departments
            .filter(
              (department) =>
                department.isActive || department.id === position?.departmentId,
            )
            .map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
                {department.isActive ? "" : " (inactive)"}
              </option>
            ))}
        </Select>
      </Field>
      <Field
        label="Description"
        htmlFor={`position-description-${position?.id ?? "new"}`}
        error={fields?.description?.[0]}
      >
        <Textarea
          id={`position-description-${position?.id ?? "new"}`}
          name="description"
          defaultValue={position?.description}
        />
      </Field>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {position ? <Save className="size-4" /> : <Plus className="size-4" />}
          {pending
            ? "Saving..."
            : position
              ? "Save position"
              : "Create position"}
        </Button>
        {state?.ok ? (
          <span className="text-sm text-emerald-700">Saved</span>
        ) : null}
      </div>
      {state && !state.ok ? (
        <div className="md:col-span-2">
          <Alert variant="error">{state.error.message}</Alert>
        </div>
      ) : null}
    </form>
  );
}

export function OrganizationManagement({
  departments,
  positions,
}: {
  departments: Department[];
  positions: Position[];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Building2 className="size-4 text-blue-700" /> Departments
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <DepartmentForm />
          <div className="space-y-3 border-t border-slate-100 pt-5">
            {departments.map((department) => (
              <details
                key={department.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {department.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {department.code} · {department.employeeCount} employees
                        · {department.positionCount} positions
                      </p>
                    </div>
                    <StatusBadge
                      status={department.isActive ? "Active" : "Disabled"}
                    />
                  </div>
                </summary>
                <div className="mt-4 space-y-4">
                  <DepartmentForm department={department} />
                  <ToggleButton
                    kind="department"
                    id={department.id}
                    active={department.isActive}
                  />
                </div>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <BriefcaseBusiness className="size-4 text-blue-700" /> Positions
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <PositionForm departments={departments} />
          <div className="space-y-3 border-t border-slate-100 pt-5">
            {positions.map((position) => (
              <details
                key={position.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {position.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {position.code} · {position.employeeCount} employees
                      </p>
                    </div>
                    <StatusBadge
                      status={position.isActive ? "Active" : "Disabled"}
                    />
                  </div>
                </summary>
                <div className="mt-4 space-y-4">
                  <PositionForm position={position} departments={departments} />
                  <ToggleButton
                    kind="position"
                    id={position.id}
                    active={position.isActive}
                  />
                </div>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
