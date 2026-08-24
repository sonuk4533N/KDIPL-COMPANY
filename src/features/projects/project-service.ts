import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  AuditAction,
  ProjectAssignmentRole,
  ProjectStatus,
  SiteAssignmentRole,
  SiteStatus,
} from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import {
  dateInput,
  type ProjectAssignmentInput,
  type ProjectInput,
  type ProjectStatusInput,
  type SiteAssignmentInput,
  type SiteInput,
  type SiteStatusInput,
} from "@/features/projects/project-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";

const projectTransitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
  PLANNING: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  ACTIVE: [
    ProjectStatus.ON_HOLD,
    ProjectStatus.COMPLETED,
    ProjectStatus.CANCELLED,
  ],
  ON_HOLD: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

const siteTransitions: Record<SiteStatus, readonly SiteStatus[]> = {
  PLANNING: [SiteStatus.ACTIVE, SiteStatus.CANCELLED],
  ACTIVE: [SiteStatus.ON_HOLD, SiteStatus.COMPLETED, SiteStatus.CANCELLED],
  ON_HOLD: [SiteStatus.ACTIVE, SiteStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

function isClosedProjectStatus(status: ProjectStatus) {
  return (
    status === ProjectStatus.COMPLETED || status === ProjectStatus.CANCELLED
  );
}

function isClosedSiteStatus(status: SiteStatus) {
  return status === SiteStatus.COMPLETED || status === SiteStatus.CANCELLED;
}

function canHostActiveSite(status: ProjectStatus) {
  return status === ProjectStatus.ACTIVE || status === ProjectStatus.ON_HOLD;
}

async function ensureProjectScope(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  projectId: string,
) {
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) return;
  if (!principal.employeeId) throw new AppError("FORBIDDEN");
  const assignment = await transaction.project.findFirst({
    where: {
      id: projectId,
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
    },
    select: { id: true },
  });
  if (!assignment) throw new AppError("FORBIDDEN");
}

async function ensureSiteScope(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  siteId: string,
) {
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) return;
  if (!principal.employeeId) throw new AppError("FORBIDDEN");
  const assignment = await transaction.site.findFirst({
    where: {
      id: siteId,
      OR: [
        {
          assignments: {
            some: { employeeId: principal.employeeId, isActive: true },
          },
        },
        {
          project: {
            assignments: {
              some: { employeeId: principal.employeeId, isActive: true },
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (!assignment) throw new AppError("FORBIDDEN");
}

export const ProjectService = {
  async saveProject(principal: AuthenticatedPrincipal, input: ProjectInput) {
    return db.$transaction(async (transaction) => {
      const before = input.projectId
        ? await transaction.project.findUnique({
            where: { id: input.projectId },
          })
        : null;
      if (input.projectId) {
        if (!before) throw new AppError("NOT_FOUND");
        await ensureProjectScope(transaction, principal, input.projectId);
      }
      const client = await transaction.client.findUnique({
        where: { id: input.clientId },
        select: { id: true, isActive: true },
      });
      if (!client || (!client.isActive && before?.clientId !== client.id))
        throw new AppError("VALIDATION_ERROR", "Select an active client.");
      const values = {
        projectCode: input.projectCode,
        name: input.name,
        clientId: input.clientId,
        location: input.location,
        description: input.description,
        startDate: dateInput(input.startDate),
        expectedCompletionDate: dateInput(input.expectedCompletionDate),
      };
      const project = before
        ? await transaction.project.update({
            where: { id: before.id },
            data: values,
          })
        : await transaction.project.create({ data: values });
      if (!before && !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) {
        if (!principal.employeeId) throw new AppError("FORBIDDEN");
        const employee = await transaction.employee.findUnique({
          where: { id: principal.employeeId },
          select: { id: true, isActive: true },
        });
        if (!employee?.isActive) throw new AppError("FORBIDDEN");
        const assignment = await transaction.projectAssignment.create({
          data: {
            projectId: project.id,
            employeeId: employee.id,
            role: ProjectAssignmentRole.PROJECT_MEMBER,
          },
        });
        await AuditService.record(
          {
            actorUserId: principal.userId,
            action: AuditAction.CREATE,
            entityType: "ProjectAssignment",
            entityId: assignment.id,
            after: {
              projectId: project.id,
              employeeId: employee.id,
              role: assignment.role,
              source: "project-creator",
            },
          },
          transaction,
        );
      }
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "Project",
          entityId: project.id,
          before,
          after: project,
        },
        transaction,
      );
      return { id: project.id };
    });
  },

  async saveSite(principal: AuthenticatedPrincipal, input: SiteInput) {
    return db.$transaction(async (transaction) => {
      const before = input.siteId
        ? await transaction.site.findUnique({ where: { id: input.siteId } })
        : null;
      if (input.siteId) {
        if (!before) throw new AppError("NOT_FOUND");
        await ensureSiteScope(transaction, principal, input.siteId);
        if (before.projectId !== input.projectId)
          throw new AppError(
            "CONFLICT",
            "A site cannot be moved to another project.",
          );
      } else {
        await ensureProjectScope(transaction, principal, input.projectId);
      }
      const project = await transaction.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, status: true },
      });
      if (!project) throw new AppError("NOT_FOUND");
      if (!before && isClosedProjectStatus(project.status))
        throw new AppError(
          "CONFLICT",
          "New sites cannot be added to a closed project.",
        );
      const values = {
        siteCode: input.siteCode,
        name: input.name,
        projectId: input.projectId,
        location: input.location,
        address: input.address,
        description: input.description,
      };
      const site = before
        ? await transaction.site.update({
            where: { id: before.id },
            data: values,
          })
        : await transaction.site.create({ data: values });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "Site",
          entityId: site.id,
          before,
          after: site,
        },
        transaction,
      );
      return { id: site.id, projectId: site.projectId };
    });
  },

  async setProjectStatus(
    principal: AuthenticatedPrincipal,
    input: ProjectStatusInput,
  ) {
    return db.$transaction(async (transaction) => {
      const before = await transaction.project.findUnique({
        where: { id: input.projectId },
        include: {
          sites: {
            where: {
              status: { notIn: [SiteStatus.COMPLETED, SiteStatus.CANCELLED] },
            },
            select: { id: true },
          },
        },
      });
      if (!before) throw new AppError("NOT_FOUND");
      await ensureProjectScope(transaction, principal, before.id);
      if (before.status === input.status) return { id: before.id };
      if (!projectTransitions[before.status].includes(input.status))
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (isClosedProjectStatus(input.status) && before.sites.length)
        throw new AppError(
          "CONFLICT",
          "Complete or cancel every open site before closing the project.",
        );
      const project = await transaction.project.update({
        where: { id: before.id },
        data: {
          status: input.status,
          actualCompletionDate:
            input.status === ProjectStatus.COMPLETED
              ? (before.actualCompletionDate ?? new Date())
              : before.actualCompletionDate,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action:
            input.status === ProjectStatus.CANCELLED
              ? AuditAction.CANCEL
              : AuditAction.UPDATE,
          entityType: "Project",
          entityId: project.id,
          before: { status: before.status },
          after: { status: project.status },
        },
        transaction,
      );
      return { id: project.id };
    });
  },

  async setSiteStatus(
    principal: AuthenticatedPrincipal,
    input: SiteStatusInput,
  ) {
    return db.$transaction(async (transaction) => {
      const before = await transaction.site.findUnique({
        where: { id: input.siteId },
        include: { project: { select: { status: true } } },
      });
      if (!before) throw new AppError("NOT_FOUND");
      await ensureSiteScope(transaction, principal, before.id);
      if (before.status === input.status)
        return { id: before.id, projectId: before.projectId };
      if (!siteTransitions[before.status].includes(input.status))
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (
        input.status === SiteStatus.ACTIVE &&
        !canHostActiveSite(before.project.status)
      )
        throw new AppError(
          "CONFLICT",
          "Activate the project before activating its site.",
        );
      const site = await transaction.site.update({
        where: { id: before.id },
        data: { status: input.status },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action:
            input.status === SiteStatus.CANCELLED
              ? AuditAction.CANCEL
              : AuditAction.UPDATE,
          entityType: "Site",
          entityId: site.id,
          before: { status: before.status },
          after: { status: site.status, projectId: site.projectId },
        },
        transaction,
      );
      return { id: site.id, projectId: site.projectId };
    });
  },

  async assignProject(
    principal: AuthenticatedPrincipal,
    input: ProjectAssignmentInput,
  ) {
    return db.$transaction(async (transaction) => {
      await ensureProjectScope(transaction, principal, input.projectId);
      const [project, employee] = await Promise.all([
        transaction.project.findUnique({
          where: { id: input.projectId },
          select: { id: true, status: true },
        }),
        transaction.employee.findUnique({
          where: { id: input.employeeId },
          select: { id: true, fullName: true, isActive: true },
        }),
      ]);
      if (!project) throw new AppError("NOT_FOUND");
      if (!employee?.isActive)
        throw new AppError("VALIDATION_ERROR", "Select an active employee.");
      if (isClosedProjectStatus(project.status))
        throw new AppError(
          "CONFLICT",
          "Assignments cannot change on a closed project.",
        );
      const isPrimary =
        input.role === ProjectAssignmentRole.PROJECT_MANAGER && input.isPrimary;
      if (isPrimary) {
        await transaction.projectAssignment.updateMany({
          where: {
            projectId: input.projectId,
            role: ProjectAssignmentRole.PROJECT_MANAGER,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }
      const existing = await transaction.projectAssignment.findUnique({
        where: {
          projectId_employeeId_role: {
            projectId: input.projectId,
            employeeId: input.employeeId,
            role: input.role,
          },
        },
      });
      const assignment = await transaction.projectAssignment.upsert({
        where: {
          projectId_employeeId_role: {
            projectId: input.projectId,
            employeeId: input.employeeId,
            role: input.role,
          },
        },
        create: { ...input, isPrimary },
        update: {
          isActive: true,
          isPrimary,
          startsAt: new Date(),
          endsAt: null,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "ProjectAssignment",
          entityId: assignment.id,
          before: existing,
          after: {
            projectId: assignment.projectId,
            employeeId: assignment.employeeId,
            employeeName: employee.fullName,
            role: assignment.role,
            isPrimary: assignment.isPrimary,
            isActive: assignment.isActive,
          },
        },
        transaction,
      );
      return { id: assignment.id, projectId: assignment.projectId };
    });
  },

  async assignSite(
    principal: AuthenticatedPrincipal,
    input: SiteAssignmentInput,
  ) {
    return db.$transaction(async (transaction) => {
      await ensureSiteScope(transaction, principal, input.siteId);
      const [site, employee] = await Promise.all([
        transaction.site.findUnique({
          where: { id: input.siteId },
          select: { id: true, projectId: true, status: true },
        }),
        transaction.employee.findUnique({
          where: { id: input.employeeId },
          select: { id: true, fullName: true, isActive: true },
        }),
      ]);
      if (!site) throw new AppError("NOT_FOUND");
      if (!employee?.isActive)
        throw new AppError("VALIDATION_ERROR", "Select an active employee.");
      if (isClosedSiteStatus(site.status))
        throw new AppError(
          "CONFLICT",
          "Assignments cannot change on a closed site.",
        );
      const isPrimary =
        input.role === SiteAssignmentRole.SITE_SUPERVISOR && input.isPrimary;
      if (isPrimary) {
        await transaction.siteAssignment.updateMany({
          where: {
            siteId: input.siteId,
            role: SiteAssignmentRole.SITE_SUPERVISOR,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }
      const existing = await transaction.siteAssignment.findUnique({
        where: {
          siteId_employeeId_role: {
            siteId: input.siteId,
            employeeId: input.employeeId,
            role: input.role,
          },
        },
      });
      const assignment = await transaction.siteAssignment.upsert({
        where: {
          siteId_employeeId_role: {
            siteId: input.siteId,
            employeeId: input.employeeId,
            role: input.role,
          },
        },
        create: { ...input, isPrimary },
        update: {
          isActive: true,
          isPrimary,
          startsAt: new Date(),
          endsAt: null,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "SiteAssignment",
          entityId: assignment.id,
          before: existing,
          after: {
            siteId: assignment.siteId,
            employeeId: assignment.employeeId,
            employeeName: employee.fullName,
            role: assignment.role,
            isPrimary: assignment.isPrimary,
            isActive: assignment.isActive,
          },
        },
        transaction,
      );
      return { id: assignment.id, projectId: site.projectId };
    });
  },

  async toggleAssignment(
    principal: AuthenticatedPrincipal,
    kind: "project" | "site",
    assignmentId: string,
  ) {
    return db.$transaction(async (transaction) => {
      if (kind === "project") {
        const before = await transaction.projectAssignment.findUnique({
          where: { id: assignmentId },
          include: {
            employee: { select: { isActive: true } },
            project: { select: { status: true } },
          },
        });
        if (!before) throw new AppError("NOT_FOUND");
        await ensureProjectScope(transaction, principal, before.projectId);
        if (isClosedProjectStatus(before.project.status))
          throw new AppError(
            "CONFLICT",
            "Assignments cannot change on a closed project.",
          );
        if (!before.isActive && !before.employee.isActive)
          throw new AppError("CONFLICT", "Reactivate the employee first.");
        const assignment = await transaction.projectAssignment.update({
          where: { id: before.id },
          data: {
            isActive: !before.isActive,
            isPrimary: !before.isActive ? before.isPrimary : false,
            startsAt: !before.isActive ? new Date() : before.startsAt,
            endsAt: before.isActive ? new Date() : null,
          },
        });
        await AuditService.record(
          {
            actorUserId: principal.userId,
            action: AuditAction.UPDATE,
            entityType: "ProjectAssignment",
            entityId: assignment.id,
            before: { isActive: before.isActive },
            after: {
              isActive: assignment.isActive,
              projectId: assignment.projectId,
            },
          },
          transaction,
        );
        return { projectId: assignment.projectId };
      }
      const before = await transaction.siteAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          employee: { select: { isActive: true } },
          site: { select: { projectId: true, status: true } },
        },
      });
      if (!before) throw new AppError("NOT_FOUND");
      await ensureSiteScope(transaction, principal, before.siteId);
      if (isClosedSiteStatus(before.site.status))
        throw new AppError(
          "CONFLICT",
          "Assignments cannot change on a closed site.",
        );
      if (!before.isActive && !before.employee.isActive)
        throw new AppError("CONFLICT", "Reactivate the employee first.");
      const assignment = await transaction.siteAssignment.update({
        where: { id: before.id },
        data: {
          isActive: !before.isActive,
          isPrimary: !before.isActive ? before.isPrimary : false,
          startsAt: !before.isActive ? new Date() : before.startsAt,
          endsAt: before.isActive ? new Date() : null,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "SiteAssignment",
          entityId: assignment.id,
          before: { isActive: before.isActive },
          after: { isActive: assignment.isActive, siteId: assignment.siteId },
        },
        transaction,
      );
      return { projectId: before.site.projectId };
    });
  },
};
