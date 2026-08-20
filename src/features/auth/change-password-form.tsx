"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import {
  changePasswordAction,
  type SecurityActionState,
} from "@/features/auth/security-actions";

export function ChangePasswordForm({
  required = false,
}: {
  required?: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    SecurityActionState,
    FormData
  >(changePasswordAction, null);
  const fields = state && !state.ok ? state.error.fields : undefined;

  useEffect(() => {
    if (required && state?.ok) {
      router.replace("/dashboard");
      router.refresh();
    }
  }, [required, router, state]);

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok ? (
        <Alert variant="error">{state.error.message}</Alert>
      ) : null}
      {state?.ok && !required ? (
        <Alert variant="success">
          Password updated. Other signed-in devices have been disconnected.
        </Alert>
      ) : null}
      <Field
        label="Current password"
        htmlFor="currentPassword"
        error={fields?.currentPassword?.[0]}
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field
        label="New password"
        htmlFor="newPassword"
        hint="12+ characters with uppercase, lowercase, number, and symbol"
        error={fields?.newPassword?.[0]}
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </Field>
      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        error={fields?.confirmPassword?.[0]}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </Field>
      <Button type="submit" disabled={pending}>
        <KeyRound className="size-4" />
        {pending ? "Updating password..." : "Update password"}
      </Button>
    </form>
  );
}
