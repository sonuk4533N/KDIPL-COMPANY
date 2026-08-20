"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentSession } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { AppError, toCommandError } from "@/server/errors/app-error";
import type { CommandResult } from "@/types/application";
import { changePasswordSchema } from "@/features/auth/password-policy";
import { CredentialService } from "@/features/auth/credential-service";

export type SecurityActionState = CommandResult | null;

async function requireSession() {
  const session = await getCurrentSession();
  if (!session) throw new AppError("UNAUTHORIZED");
  return session;
}

export async function changePasswordAction(
  _previous: SecurityActionState,
  formData: FormData,
): Promise<SecurityActionState> {
  try {
    await validateMutationOrigin();
    const session = await requireSession();
    const parsed = changePasswordSchema.safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the password requirements.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    }
    await CredentialService.changeOwnPassword(session, parsed.data);
    revalidatePath("/account/security");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function revokeSessionAction(
  sessionId: string,
): Promise<SecurityActionState> {
  try {
    await validateMutationOrigin();
    const current = await requireSession();
    const parsed = z.string().uuid().safeParse(sessionId);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR");
    await CredentialService.revokeOwnSession(current, parsed.data);
    revalidatePath("/account/security");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function revokeOtherSessionsAction(): Promise<SecurityActionState> {
  try {
    await validateMutationOrigin();
    const current = await requireSession();
    await CredentialService.revokeOtherSessions(current);
    revalidatePath("/account/security");
    return { ok: true, data: undefined };
  } catch (error) {
    return toCommandError(error);
  }
}
