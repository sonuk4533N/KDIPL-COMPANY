import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { db } from "@/db/prisma";
import { requirePermission } from "@/server/authorization/authorization";
import type { AuthenticatedPrincipal } from "@/types/application";

function scopedProjects(
  principal: AuthenticatedPrincipal,
): Prisma.ProjectWhereInput {
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) return {};
  if (!principal.employeeId)
    return { id: { equals: "00000000-0000-0000-0000-000000000000" } };
  return {
    OR: [
      {
        assignments: {
          some: { employeeId: principal.employeeId, isActive: true },
        },
      },
      {
        sites: {
          some: {
            assignments: {
              some: { employeeId: principal.employeeId, isActive: true },
            },
          },
        },
      },
    ],
  };
}

const projectSelection = {
  id: true,
  projectCode: true,
  name: true,
  location: true,
  description: true,
  status: true,
  startDate: true,
  expectedCompletionDate: true,
  actualCompletionDate: true,
  clientId: true,
  client: { select: { id: true, name: true, isActive: true } },
  assignments: {
    orderBy: [
      { isActive: "desc" },
      { role: "asc" },
      { employee: { fullName: "asc" } },
    ],
    select: {
      id: true,
      role: true,
      isPrimary: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          isActive: true,
        },
      },
    },
  },
  sites: {
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      siteCode: true,
      name: true,
      location: true,
      address: true,
      description: true,
      status: true,
      assignments: {
        orderBy: [
          { isActive: "desc" },
          { role: "asc" },
          { employee: { fullName: "asc" } },
        ],
        select: {
          id: true,
          role: true,
          isPrimary: true,
          isActive: true,
          startsAt: true,
          endsAt: true,
          employee: {
            select: {
              id: true,
              employeeCode: true,
              fullName: true,
              isActive: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProjectSelect;

function isoDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function mapProject(
  project: Prisma.ProjectGetPayload<{ select: typeof projectSelection }>,
  principal: AuthenticatedPrincipal,
) {
  const hasFullProjectScope =
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") ||
    Boolean(
      principal.employeeId &&
      project.assignments.some(
        (assignment) =>
          assignment.isActive &&
          assignment.employee.id === principal.employeeId,
      ),
    );
  const visibleAssignments = hasFullProjectScope ? project.assignments : [];
  const visibleSites = hasFullProjectScope
    ? project.sites
    : project.sites.filter(
        (site) =>
          principal.employeeId &&
          site.assignments.some(
            (assignment) =>
              assignment.isActive &&
              assignment.employee.id === principal.employeeId,
          ),
      );
  return {
    ...project,
    startDate: isoDate(project.startDate),
    expectedCompletionDate: isoDate(project.expectedCompletionDate),
    actualCompletionDate: isoDate(project.actualCompletionDate),
    assignments: visibleAssignments.map((assignment) => ({
      ...assignment,
      startsAt: assignment.startsAt.toISOString(),
      endsAt: assignment.endsAt?.toISOString() ?? null,
    })),
    sites: visibleSites.map((site) => ({
      ...site,
      assignments: site.assignments.map((assignment) => ({
        ...assignment,
        startsAt: assignment.startsAt.toISOString(),
        endsAt: assignment.endsAt?.toISOString() ?? null,
      })),
    })),
  };
}

export async function getProjectWorkspace(principal: AuthenticatedPrincipal) {
  requirePermission(principal, "project.view");
  const [projects, clients, employees] = await Promise.all([
    db.project.findMany({
      where: scopedProjects(principal),
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: projectSelection,
    }),
    db.client.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, clientCode: true, name: true, isActive: true },
    }),
    db.employee.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, employeeCode: true, fullName: true },
    }),
  ]);
  return {
    projects: projects.map((project) => mapProject(project, principal)),
    clients,
    employees,
  };
}

export async function getProjectDetail(
  principal: AuthenticatedPrincipal,
  projectId: string,
) {
  requirePermission(principal, "project.view");
  const project = await db.project.findFirst({
    where: { id: projectId, AND: scopedProjects(principal) },
    select: projectSelection,
  });
  return project ? mapProject(project, principal) : null;
}

export type ProjectWorkspace = Awaited<ReturnType<typeof getProjectWorkspace>>;
export type ProjectDetail = NonNullable<
  Awaited<ReturnType<typeof getProjectDetail>>
>;
