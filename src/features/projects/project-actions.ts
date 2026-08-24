"use server";

import { revalidatePath } from "next/cache";

import {
  projectAssignmentSchema,
  projectSchema,
  projectStatusSchema,
  siteAssignmentSchema,
  siteSchema,
  siteStatusSchema,
} from "@/features/projects/project-schemas";
import { ProjectService } from "@/features/projects/project-service";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError, toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";

export type ProjectActionState = CommandResult<{ id?: string }> | null;

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function validationError(
  message: string,
  fields: Record<string, string[] | undefined>,
): ProjectActionState {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message,
      fields: Object.fromEntries(
        Object.entries(fields).filter((entry): entry is [string, string[]] =>
          Boolean(entry[1]?.length),
        ),
      ),
    },
  };
}

export async function saveProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    const projectId = formValue(formData, "projectId");
    requirePermission(
      principal,
      projectId ? "project.update" : "project.create",
    );
    const parsed = projectSchema.safeParse({
      projectId,
      projectCode: formValue(formData, "projectCode"),
      name: formValue(formData, "name"),
      clientId: formValue(formData, "clientId"),
      location: formValue(formData, "location"),
      description: formValue(formData, "description"),
      startDate: formValue(formData, "startDate"),
      expectedCompletionDate: formValue(formData, "expectedCompletionDate"),
    });
    if (!parsed.success)
      return validationError(
        "Please review the project information.",
        parsed.error.flatten().fieldErrors,
      );
    const result = await ProjectService.saveProject(principal, parsed.data);
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.id}`);
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function saveSiteAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    const siteId = formValue(formData, "siteId");
    requirePermission(principal, siteId ? "site.update" : "site.create");
    const parsed = siteSchema.safeParse({
      siteId,
      projectId: formValue(formData, "projectId"),
      siteCode: formValue(formData, "siteCode"),
      name: formValue(formData, "name"),
      location: formValue(formData, "location"),
      address: formValue(formData, "address"),
      description: formValue(formData, "description"),
    });
    if (!parsed.success)
      return validationError(
        "Please review the site information.",
        parsed.error.flatten().fieldErrors,
      );
    const result = await ProjectService.saveSite(principal, parsed.data);
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.projectId}`);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function setProjectStatusAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "project.update");
    const parsed = projectStatusSchema.safeParse({
      projectId: formValue(formData, "projectId"),
      status: formValue(formData, "status"),
    });
    if (!parsed.success) throw new AppError("VALIDATION_ERROR");
    const result = await ProjectService.setProjectStatus(
      principal,
      parsed.data,
    );
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.id}`);
    return { ok: true, data: result };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function setSiteStatusAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "site.update");
    const parsed = siteStatusSchema.safeParse({
      siteId: formValue(formData, "siteId"),
      status: formValue(formData, "status"),
    });
    if (!parsed.success) throw new AppError("VALIDATION_ERROR");
    const result = await ProjectService.setSiteStatus(principal, parsed.data);
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.projectId}`);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function assignProjectAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "project.assign");
    const parsed = projectAssignmentSchema.safeParse({
      projectId: formValue(formData, "projectId"),
      employeeId: formValue(formData, "employeeId"),
      role: formValue(formData, "role"),
      isPrimary: formData.get("isPrimary") === "on",
    });
    if (!parsed.success)
      return validationError(
        "Please review the project assignment.",
        parsed.error.flatten().fieldErrors,
      );
    const result = await ProjectService.assignProject(principal, parsed.data);
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.projectId}`);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function assignSiteAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "project.assign");
    const parsed = siteAssignmentSchema.safeParse({
      siteId: formValue(formData, "siteId"),
      employeeId: formValue(formData, "employeeId"),
      role: formValue(formData, "role"),
      isPrimary: formData.get("isPrimary") === "on",
    });
    if (!parsed.success)
      return validationError(
        "Please review the site assignment.",
        parsed.error.flatten().fieldErrors,
      );
    const result = await ProjectService.assignSite(principal, parsed.data);
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.projectId}`);
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function toggleAssignmentAction(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    requirePermission(principal, "project.assign");
    const kind = formValue(formData, "kind");
    const assignmentId = formValue(formData, "assignmentId");
    if ((kind !== "project" && kind !== "site") || !assignmentId)
      throw new AppError("VALIDATION_ERROR");
    const result = await ProjectService.toggleAssignment(
      principal,
      kind,
      assignmentId,
    );
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.projectId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return toCommandError(error);
  }
}
