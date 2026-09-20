"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogIn } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { loginAction, type LoginState } from "@/features/auth/actions";
import { TwoFactorLoginStep } from "@/features/auth/two-factor-login-step";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <LogIn className="size-4" />
      )}
      {pending ? "Signing in..." : "Sign in securely"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );
  const [cancelledTwoFactor, setCancelledTwoFactor] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok && state.data.redirectTo && !state.data.requiresTwoFactor) {
      router.push(state.data.redirectTo);
    }
  }, [state, router]);

  if (state?.ok && state.data.requiresTwoFactor && !cancelledTwoFactor) {
    return (
      <TwoFactorLoginStep
        initialData={state.data}
        onCancel={() => setCancelledTwoFactor(true)}
      />
    );
  }

  const fieldErrors = state && !state.ok ? state.error.fields : undefined;

  return (
    <form
      action={(data) => {
        setCancelledTwoFactor(false);
        return formAction(data);
      }}
      className="space-y-5"
      noValidate
    >
      {state && !state.ok && state.error.code !== "VALIDATION_ERROR" ? (
        <Alert variant="error">{state.error.message}</Alert>
      ) : null}
      <Field label="Work email" htmlFor="email" error={fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          aria-invalid={Boolean(fieldErrors?.email)}
          required
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={fieldErrors?.password?.[0]}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(fieldErrors?.password)}
          required
        />
      </Field>
      <SubmitButton />
    </form>
  );
}
