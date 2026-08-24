import { CalendarDays, MapPin, UserRound, Users } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge, type StandardStatus } from "@/components/ui/status-badge";
import {
  AssignmentForm,
  AssignmentToggle,
  ProjectForm,
  SiteForm,
  StatusForm,
} from "@/features/projects/project-forms";
import type { ProjectDetail } from "@/features/projects/project-queries";

function statusLabel(status: string): StandardStatus {
  return {
    PLANNING: "Planning",
    ACTIVE: "Active",
    ON_HOLD: "On hold",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  }[status] as StandardStatus;
}

export function ProjectDetailView({
  project,
  clients,
  employees,
  canUpdate,
  canCreateSite,
  canUpdateSite,
  canAssign,
}: {
  project: ProjectDetail;
  clients: { id: string; name: string; isActive: boolean }[];
  employees: { id: string; employeeCode: string; fullName: string }[];
  canUpdate: boolean;
  canCreateSite: boolean;
  canUpdateSite: boolean;
  canAssign: boolean;
}) {
  const activeTeam = project.assignments.filter(
    (assignment) => assignment.isActive,
  );
  const primaryManager =
    activeTeam.find(
      (assignment) =>
        assignment.role === "PROJECT_MANAGER" && assignment.isPrimary,
    ) ?? activeTeam.find((assignment) => assignment.role === "PROJECT_MANAGER");
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <ButtonLink
            href="/projects"
            variant="tertiary"
            className="-ml-4 mb-2"
          >
            ← Back to projects
          </ButtonLink>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              {project.name}
            </h1>
            <StatusBadge status={statusLabel(project.status)} />
          </div>
          <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-blue-700">
            {project.projectCode}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            {project.description ||
              "No project description has been added yet."}
          </p>
        </div>
        {canUpdate ? (
          <div className="w-full max-w-xs">
            <StatusForm
              kind="project"
              id={project.id}
              current={project.status}
            />
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Client", project.client.name, UserRound],
          ["Location", project.location, MapPin],
          [
            "Project manager",
            primaryManager?.employee.fullName ?? "Not assigned",
            Users,
          ],
          [
            "Expected completion",
            project.expectedCompletionDate ?? "Not set",
            CalendarDays,
          ],
        ].map(([label, value, Icon]) => (
          <Card key={String(label)}>
            <CardContent>
              <Icon className="size-5 text-blue-700" />
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {String(label)}
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {String(value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-7 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section className="space-y-5" aria-labelledby="sites-title">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2
                id="sites-title"
                className="font-display text-xl font-bold text-slate-950"
              >
                Assigned sites
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {project.sites.length} project locations
              </p>
            </div>
          </div>
          {project.sites.length ? (
            <div className="grid gap-5 md:grid-cols-2">
              {project.sites.map((site) => {
                const supervisors = site.assignments.filter(
                  (assignment) =>
                    assignment.isActive &&
                    assignment.role === "SITE_SUPERVISOR",
                );
                return (
                  <Card key={site.id}>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {site.siteCode}
                        </p>
                        <h3 className="mt-1 font-display text-lg font-bold text-slate-950">
                          {site.name}
                        </h3>
                      </div>
                      <StatusBadge status={statusLabel(site.status)} />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="flex items-center gap-2 text-sm text-slate-600">
                        <MapPin className="size-4 text-slate-400" />
                        {site.location}
                      </p>
                      <p className="text-sm text-slate-500">
                        {supervisors.length
                          ? supervisors
                              .map((assignment) => assignment.employee.fullName)
                              .join(", ")
                          : "No supervisor assigned"}
                      </p>
                      {canUpdateSite || canAssign ? (
                        <details className="rounded-lg border border-slate-200 p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-blue-700">
                            Manage site
                          </summary>
                          <div className="mt-4 space-y-5">
                            {canUpdateSite ? (
                              <>
                                <SiteForm projectId={project.id} site={site} />
                                <StatusForm
                                  kind="site"
                                  id={site.id}
                                  current={site.status}
                                />
                              </>
                            ) : null}
                            {canAssign ? (
                              <>
                                <div className="border-t border-slate-100 pt-4">
                                  <AssignmentForm
                                    kind="site"
                                    parentId={site.id}
                                    employees={employees}
                                  />
                                </div>
                                <AssignmentList
                                  kind="site"
                                  assignments={site.assignments}
                                  canAssign={canAssign}
                                />
                              </>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No sites have been added to this project.
            </div>
          )}
          {canCreateSite &&
          !["COMPLETED", "CANCELLED"].includes(project.status) ? (
            <Card>
              <CardHeader>
                <h3 className="font-display font-bold text-slate-950">
                  Add project site
                </h3>
              </CardHeader>
              <CardContent>
                <SiteForm projectId={project.id} />
              </CardContent>
            </Card>
          ) : null}
        </section>
        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <h2 className="font-display font-bold text-slate-950">
                Project team
              </h2>
            </CardHeader>
            <CardContent className="space-y-5">
              {canAssign &&
              !["COMPLETED", "CANCELLED"].includes(project.status) ? (
                <AssignmentForm
                  kind="project"
                  parentId={project.id}
                  employees={employees}
                />
              ) : null}
              <AssignmentList
                kind="project"
                assignments={project.assignments}
                canAssign={canAssign}
              />
            </CardContent>
          </Card>
          {canUpdate ? (
            <Card>
              <CardHeader>
                <h2 className="font-display font-bold text-slate-950">
                  Project information
                </h2>
              </CardHeader>
              <CardContent>
                <ProjectForm project={project} clients={clients} />
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function AssignmentList({
  kind,
  assignments,
  canAssign,
}: {
  kind: "project" | "site";
  assignments: Array<{
    id: string;
    role: string;
    isPrimary: boolean;
    isActive: boolean;
    employee: { fullName: string; employeeCode: string };
  }>;
  canAssign: boolean;
}) {
  if (!assignments.length)
    return <p className="text-sm text-slate-500">No assignments yet.</p>;
  return (
    <div className="space-y-3">
      {assignments.map((assignment) => (
        <div
          key={assignment.id}
          className="rounded-lg border border-slate-200 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">
                {assignment.employee.fullName}
              </p>
              <p className="text-xs text-slate-500">
                {assignment.employee.employeeCode} ·{" "}
                {assignment.role.replaceAll("_", " ").toLowerCase()}
                {assignment.isPrimary ? " · Primary" : ""}
              </p>
            </div>
            <StatusBadge status={assignment.isActive ? "Active" : "Disabled"} />
          </div>
          {canAssign ? (
            <div className="mt-2">
              <AssignmentToggle
                kind={kind}
                assignmentId={assignment.id}
                active={assignment.isActive}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
