import { notFound } from "next/navigation";
import { z } from "zod";

import { ProjectDetailView } from "@/features/projects/project-detail-view";
import { getProjectWorkspace } from "@/features/projects/project-queries";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) notFound();
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "project.view")) notFound();
  const workspace = await getProjectWorkspace(principal);
  const project = workspace.projects.find((item) => item.id === projectId);
  if (!project) notFound();
  return (
    <ProjectDetailView
      project={project}
      clients={workspace.clients}
      employees={workspace.employees}
      canUpdate={hasPermission(principal, "project.update")}
      canCreateSite={hasPermission(principal, "site.create")}
      canUpdateSite={hasPermission(principal, "site.update")}
      canAssign={hasPermission(principal, "project.assign")}
    />
  );
}
