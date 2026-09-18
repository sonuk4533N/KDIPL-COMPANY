"use client";

import { useActionState, useEffect } from "react";
import { Save, UserPlus } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createEmployeeAction,
  toggleEmployeeStatusAction,
  updateEmployeeAction,
} from "@/features/administration/user-actions";

type Option = { id: string; name: string; active: boolean };
type EmployeeRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  email: string;
  mobile: string;
  isActive: boolean;
  departmentId: string;
  positionId: string;
  managerId: string;
  hasUser: boolean;
};

function EmployeeFields({
  prefix,
  employee,
  employees,
  departments,
  positions,
  fields,
}: {
  prefix: string;
  employee?: EmployeeRow;
  employees: EmployeeRow[];
  departments: Option[];
  positions: Option[];
  fields?: Record<string, string[]>;
}) {
  return (
    <>
      <Field
        label="Employee code"
        htmlFor={`${prefix}-employeeCode`}
        error={fields?.employeeCode?.[0]}
      >
        <Input
          id={`${prefix}-employeeCode`}
          name="employeeCode"
          defaultValue={employee?.employeeCode}
          required
        />
      </Field>
      <Field
        label="Full name"
        htmlFor={`${prefix}-fullName`}
        error={fields?.fullName?.[0]}
      >
        <Input
          id={`${prefix}-fullName`}
          name="fullName"
          defaultValue={employee?.fullName}
          required
        />
      </Field>
      <Field
        label="Work email"
        htmlFor={`${prefix}-email`}
        error={fields?.email?.[0]}
      >
        <Input
          id={`${prefix}-email`}
          name="email"
          type="email"
          defaultValue={employee?.email}
        />
      </Field>
      <Field
        label="Mobile"
        htmlFor={`${prefix}-mobile`}
        error={fields?.mobile?.[0]}
      >
        <Input
          id={`${prefix}-mobile`}
          name="mobile"
          defaultValue={employee?.mobile}
        />
      </Field>
      <Field
        label="Department"
        htmlFor={`${prefix}-departmentId`}
        error={fields?.departmentId?.[0]}
      >
        <Select
          id={`${prefix}-departmentId`}
          name="departmentId"
          defaultValue={employee?.departmentId}
        >
          <option value="">No department</option>
          {departments
            .filter((item) => item.active || item.id === employee?.departmentId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.active ? "" : " (inactive)"}
              </option>
            ))}
        </Select>
      </Field>
      <Field
        label="Position"
        htmlFor={`${prefix}-positionId`}
        error={fields?.positionId?.[0]}
      >
        <Select
          id={`${prefix}-positionId`}
          name="positionId"
          defaultValue={employee?.positionId}
        >
          <option value="">No position</option>
          {positions
            .filter((item) => item.active || item.id === employee?.positionId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.active ? "" : " (inactive)"}
              </option>
            ))}
        </Select>
      </Field>
      <Field
        label="Additional designation"
        htmlFor={`${prefix}-designation`}
        error={fields?.designation?.[0]}
      >
        <Input
          id={`${prefix}-designation`}
          name="designation"
          defaultValue={employee?.designation}
        />
      </Field>
      <Field
        label="Reports to"
        htmlFor={`${prefix}-managerId`}
        error={fields?.managerId?.[0]}
      >
        <Select
          id={`${prefix}-managerId`}
          name="managerId"
          defaultValue={employee?.managerId}
        >
          <option value="">No manager</option>
          {employees
            .filter((item) => item.isActive && item.id !== employee?.id)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
        </Select>
      </Field>
    </>
  );
}

function EmployeeEditor({
  employee,
  employees,
  departments,
  positions,
}: {
  employee: EmployeeRow;
  employees: EmployeeRow[];
  departments: Option[];
  positions: Option[];
}) {
  const [state, action, pending] = useActionState(updateEmployeeAction, null);
  const [toggleState, toggleAction, toggling] = useActionState(
    async () => toggleEmployeeStatusAction(employee.id),
    null,
  );
  useEffect(() => {
    if (toggleState && !toggleState.ok) window.alert(toggleState.error.message);
  }, [toggleState]);
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-950">{employee.fullName}</p>
            <p className="text-xs text-slate-500">
              {employee.employeeCode}
              {employee.hasUser ? " · Login linked" : " · No login"}
            </p>
          </div>
          <StatusBadge status={employee.isActive ? "Active" : "Disabled"} />
        </div>
      </summary>
      <form
        action={action}
        className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <input type="hidden" name="employeeId" value={employee.id} />
        <EmployeeFields
          prefix={employee.id}
          employee={employee}
          employees={employees}
          departments={departments}
          positions={positions}
          fields={fields}
        />
        <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-4">
          <Button type="submit" size="sm" disabled={pending}>
            <Save className="size-4" />
            {pending ? "Saving..." : "Save employee"}
          </Button>
          {state?.ok ? (
            <span className="text-sm text-emerald-700">Saved</span>
          ) : null}
          {state && !state.ok ? (
            <Alert variant="error">{state.error.message}</Alert>
          ) : null}
        </div>
      </form>
      <form
        action={toggleAction}
        className="mt-4 border-t border-slate-100 pt-4"
      >
        <Button type="submit" size="sm" variant="tertiary" disabled={toggling}>
          {toggling
            ? "Saving..."
            : employee.isActive
              ? "Deactivate employee"
              : "Reactivate employee"}
        </Button>
        {employee.isActive && employee.hasUser ? (
          <p className="mt-2 text-xs text-amber-700">
            Deactivation also disables the linked login account.
          </p>
        ) : null}
      </form>
    </details>
  );
}

export function EmployeeManagement({
  employees,
  departments,
  positions,
}: {
  employees: EmployeeRow[];
  departments: Option[];
  positions: Option[];
}) {
  const [state, action, pending] = useActionState(createEmployeeAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <UserPlus className="size-4 text-blue-700" />
            Add employee
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Employee records can exist before login access is required.
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
              <Alert variant="success">Employee created.</Alert>
            </div>
          ) : null}
          <form
            action={action}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            <EmployeeFields
              prefix="new"
              employees={employees}
              departments={departments}
              positions={positions}
              fields={fields}
            />
            <div className="md:col-span-2 xl:col-span-4">
              <Button
                type="submit"
                disabled={pending}
                className="relative z-10 w-full scroll-my-24 sm:w-auto"
              >
                <UserPlus className="size-4" />
                {pending ? "Creating..." : "Add employee"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Employee directory
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Maintain reporting lines, organization placement, and employment
            status.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {employees.map((employee) => (
            <EmployeeEditor
              key={employee.id}
              employee={employee}
              employees={employees}
              departments={departments}
              positions={positions}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
