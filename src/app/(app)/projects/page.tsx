import {
  BriefcaseBusiness,
  Building2,
  CirclePause,
  Plus,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApplicationState } from "@/components/ui/states";
import { ProjectForm } from "@/features/projects/project-forms";
import { ProjectList } from "@/features/projects/project-list";
import { getProjectWorkspace } from "@/features/projects/project-queries";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function ProjectsPage() {
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "project.view"))
    return (
      <ApplicationState
        kind="forbidden"
        title="Project access required"
        description="You need project visibility and an active project or site assignment to use this workspace."
      />
    );
  const workspace = await getProjectWorkspace(principal);
  const canCreate = hasPermission(principal, "project.create");
  const metrics = [
    {
      label: "Visible projects",
      value: workspace.projects.length,
      icon: BriefcaseBusiness,
    },
    {
      label: "Active projects",
      value: workspace.projects.filter((project) => project.status === "ACTIVE")
        .length,
      icon: Users,
    },
    {
      label: "Project sites",
      value: workspace.projects.reduce(
        (total, project) => total + project.sites.length,
        0,
      ),
      icon: Building2,
    },
    {
      label: "On hold",
      value: workspace.projects.filter(
        (project) => project.status === "ON_HOLD",
      ).length,
      icon: CirclePause,
    },
  ];
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Phase 2 · Project foundation"
        title="Projects"
        description="Maintain the project portfolio, operating sites, responsible teams, and assignment-based access."
        action={
          canCreate ? (
            <ButtonLink href="#new-project">
              <Plus className="size-4" />
              New project
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent>
              <Icon className="size-5 text-blue-700" />
              <p className="mt-4 text-sm text-slate-500">{label}</p>
              <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {canCreate ? (
        <Card id="new-project" className="scroll-mt-28">
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Create project
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Codes are normalized to uppercase and remain stable throughout the
              project lifecycle.
            </p>
          </CardHeader>
          <CardContent>
            <ProjectForm clients={workspace.clients} />
          </CardContent>
        </Card>
      ) : null}
      <ProjectList projects={workspace.projects} />
    </div>
  );
}
