"use client";

import { useActionState } from "react";
import { Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  assignProjectAction,
  assignSiteAction,
  saveProjectAction,
  saveSiteAction,
  setProjectStatusAction,
  setSiteStatusAction,
  toggleAssignmentAction,
} from "@/features/projects/project-actions";

type ClientOption = { id: string; name: string; isActive: boolean };
type EmployeeOption = { id: string; employeeCode: string; fullName: string };

type ProjectRecord = {
  id: string;
  projectCode: string;
  name: string;
  clientId: string;
  location: string;
  description: string | null;
  startDate: string | null;
  expectedCompletionDate: string | null;
  status: string;
};

type SiteRecord = {
  id: string;
  siteCode: string;
  name: string;
  location: string;
  address: string | null;
  description: string | null;
  status: string;
};

export function ProjectForm({
  clients,
  project,
}: {
  clients: ClientOption[];
  project?: ProjectRecord;
}) {
  const [state, action, pending] = useActionState(saveProjectAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;
  const suffix = project?.id ?? "new";
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {project ? (
        <input type="hidden" name="projectId" value={project.id} />
      ) : null}
      <Field
        label="Project code"
        htmlFor={`project-code-${suffix}`}
        error={fields?.projectCode?.[0]}
      >
        <Input
          id={`project-code-${suffix}`}
          name="projectCode"
          defaultValue={project?.projectCode}
          placeholder="PROJECT-0025"
          required
          aria-invalid={Boolean(fields?.projectCode)}
        />
      </Field>
      <Field
        label="Project name"
        htmlFor={`project-name-${suffix}`}
        error={fields?.name?.[0]}
      >
        <Input
          id={`project-name-${suffix}`}
          name="name"
          defaultValue={project?.name}
          required
          aria-invalid={Boolean(fields?.name)}
        />
      </Field>
      <Field
        label="Client"
        htmlFor={`project-client-${suffix}`}
        error={fields?.clientId?.[0]}
      >
        <Select
          id={`project-client-${suffix}`}
          name="clientId"
          defaultValue={project?.clientId}
          required
          aria-invalid={Boolean(fields?.clientId)}
        >
          <option value="">Select client</option>
          {clients
            .filter(
              (client) => client.isActive || client.id === project?.clientId,
            )
            .map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.isActive ? "" : " (inactive)"}
              </option>
            ))}
        </Select>
      </Field>
      <Field
        label="Location"
        htmlFor={`project-location-${suffix}`}
        error={fields?.location?.[0]}
      >
        <Input
          id={`project-location-${suffix}`}
          name="location"
          defaultValue={project?.location}
          placeholder="Noida, Uttar Pradesh"
          required
          aria-invalid={Boolean(fields?.location)}
        />
      </Field>
      <Field
        label="Start date"
        htmlFor={`project-start-${suffix}`}
        error={fields?.startDate?.[0]}
      >
        <Input
          id={`project-start-${suffix}`}
          name="startDate"
          type="date"
          defaultValue={project?.startDate ?? ""}
          aria-invalid={Boolean(fields?.startDate)}
        />
      </Field>
      <Field
        label="Expected completion"
        htmlFor={`project-end-${suffix}`}
        error={fields?.expectedCompletionDate?.[0]}
      >
        <Input
          id={`project-end-${suffix}`}
          name="expectedCompletionDate"
          type="date"
          defaultValue={project?.expectedCompletionDate ?? ""}
          aria-invalid={Boolean(fields?.expectedCompletionDate)}
        />
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Description"
          htmlFor={`project-description-${suffix}`}
          error={fields?.description?.[0]}
        >
          <Textarea
            id={`project-description-${suffix}`}
            name="description"
            defaultValue={project?.description ?? ""}
            aria-invalid={Boolean(fields?.description)}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={pending}>
          {project ? <Save className="size-4" /> : <Plus className="size-4" />}
          {pending ? "Saving..." : project ? "Save project" : "Create project"}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFeedback
          state={state}
          success={project ? "Project updated." : "Project created."}
        />
      </div>
    </form>
  );
}

export function SiteForm({
  projectId,
  site,
}: {
  projectId: string;
  site?: SiteRecord;
}) {
  const [state, action, pending] = useActionState(saveSiteAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;
  const suffix = site?.id ?? `new-${projectId}`;
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      {site ? <input type="hidden" name="siteId" value={site.id} /> : null}
      <Field
        label="Site code"
        htmlFor={`site-code-${suffix}`}
        error={fields?.siteCode?.[0]}
      >
        <Input
          id={`site-code-${suffix}`}
          name="siteCode"
          defaultValue={site?.siteCode}
          placeholder="FLOOR-03"
          required
          aria-invalid={Boolean(fields?.siteCode)}
        />
      </Field>
      <Field
        label="Site name"
        htmlFor={`site-name-${suffix}`}
        error={fields?.name?.[0]}
      >
        <Input
          id={`site-name-${suffix}`}
          name="name"
          defaultValue={site?.name}
          required
          aria-invalid={Boolean(fields?.name)}
        />
      </Field>
      <Field
        label="Location"
        htmlFor={`site-location-${suffix}`}
        error={fields?.location?.[0]}
      >
        <Input
          id={`site-location-${suffix}`}
          name="location"
          defaultValue={site?.location}
          required
          aria-invalid={Boolean(fields?.location)}
        />
      </Field>
      <Field
        label="Address"
        htmlFor={`site-address-${suffix}`}
        error={fields?.address?.[0]}
      >
        <Input
          id={`site-address-${suffix}`}
          name="address"
          defaultValue={site?.address ?? ""}
          aria-invalid={Boolean(fields?.address)}
        />
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Description"
          htmlFor={`site-description-${suffix}`}
          error={fields?.description?.[0]}
        >
          <Textarea
            id={`site-description-${suffix}`}
            name="description"
            defaultValue={site?.description ?? ""}
            aria-invalid={Boolean(fields?.description)}
          />
        </Field>
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="md:col-span-2 md:justify-self-start"
      >
        {site ? <Save className="size-4" /> : <Plus className="size-4" />}
        {pending ? "Saving..." : site ? "Save site" : "Add site"}
      </Button>
      <div className="md:col-span-2">
        <FormFeedback
          state={state}
          success={site ? "Site updated." : "Site added."}
        />
      </div>
    </form>
  );
}

export function StatusForm({
  kind,
  id,
  current,
}: {
  kind: "project" | "site";
  id: string;
  current: string;
}) {
  const [state, action, pending] = useActionState(
    kind === "project" ? setProjectStatusAction : setSiteStatusAction,
    null,
  );
  const transitions: Record<string, string[]> = {
    PLANNING: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
    ON_HOLD: ["ACTIVE", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };
  const options = transitions[current] ?? [];
  if (!options.length) return null;
  return (
    <form action={action} className="space-y-3">
      <input
        type="hidden"
        name={kind === "project" ? "projectId" : "siteId"}
        value={id}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          name="status"
          aria-label={`New ${kind} status`}
          required
          defaultValue=""
        >
          <option value="" disabled>
            Change status...
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option
                .replace("_", " ")
                .toLowerCase()
                .replace(/^./, (letter) => letter.toUpperCase())}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Updating..." : "Update status"}
        </Button>
      </div>
      <FormFeedback state={state} success="Status updated." />
    </form>
  );
}

export function AssignmentForm({
  kind,
  parentId,
  employees,
}: {
  kind: "project" | "site";
  parentId: string;
  employees: EmployeeOption[];
}) {
  const [state, action, pending] = useActionState(
    kind === "project" ? assignProjectAction : assignSiteAction,
    null,
  );
  const fields = state && !state.ok ? state.error.fields : undefined;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input
        type="hidden"
        name={kind === "project" ? "projectId" : "siteId"}
        value={parentId}
      />
      <Field
        label="Employee"
        htmlFor={`${kind}-assignment-employee-${parentId}`}
        error={fields?.employeeId?.[0]}
      >
        <Select
          id={`${kind}-assignment-employee-${parentId}`}
          name="employeeId"
          required
          aria-invalid={Boolean(fields?.employeeId)}
        >
          <option value="">Select employee</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName} · {employee.employeeCode}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Responsibility"
        htmlFor={`${kind}-assignment-role-${parentId}`}
        error={fields?.role?.[0]}
      >
        <Select
          id={`${kind}-assignment-role-${parentId}`}
          name="role"
          required
          defaultValue={kind === "project" ? "PROJECT_MEMBER" : "SITE_MEMBER"}
        >
          {kind === "project" ? (
            <>
              <option value="PROJECT_MANAGER">Project manager</option>
              <option value="PROJECT_MEMBER">Project member</option>
            </>
          ) : (
            <>
              <option value="SITE_SUPERVISOR">Site supervisor</option>
              <option value="SITE_MEMBER">Site member</option>
            </>
          )}
        </Select>
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
        <input
          type="checkbox"
          name="isPrimary"
          className="size-4 rounded border-slate-300"
        />
        Mark as primary manager or supervisor
      </label>
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        className="sm:col-span-2 sm:justify-self-start"
      >
        <Plus className="size-4" />
        {pending ? "Assigning..." : "Assign employee"}
      </Button>
      <div className="sm:col-span-2">
        <FormFeedback state={state} success="Assignment saved." />
      </div>
    </form>
  );
}

export function AssignmentToggle({
  kind,
  assignmentId,
  active,
}: {
  kind: "project" | "site";
  assignmentId: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState(toggleAssignmentAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Button type="submit" size="sm" variant="tertiary" disabled={pending}>
        {pending ? "Saving..." : active ? "End assignment" : "Reactivate"}
      </Button>
      <FormFeedback
        state={state}
        success={active ? "Assignment ended." : "Assignment reactivated."}
      />
    </form>
  );
}
