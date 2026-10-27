"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Forward,
  KeyRound,
  LoaderCircle,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import {
  verifyTwoFactorLoginAction,
  type LoginData,
  type LoginState,
} from "@/features/auth/actions";

function VerifyButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <ShieldCheck className="size-4" />
      )}
      {pending ? "Verifying..." : "Verify & Sign in"}
    </Button>
  );
}

export function TwoFactorLoginStep({
  initialData,
  onCancel,
}: {
  initialData: LoginData;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState<LoginState, FormData>(
    verifyTwoFactorLoginAction,
    null,
  );
  const router = useRouter();
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  useEffect(() => {
    if (state?.ok && state.data.redirectTo) {
      router.push(state.data.redirectTo);
    }
  }, [state, router]);

  const handleCopySecret = async () => {
    if (initialData.secret) {
      await navigator.clipboard.writeText(initialData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
          <KeyRound className="size-4 text-blue-600" />
          <span>
            {initialData.isEnrolling
              ? "Two-Factor Authentication Setup"
              : "Two-Factor Verification"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          {initialData.isEnrolling
            ? "Scan the QR code with Google Authenticator or Microsoft Authenticator, or click Activate & Sign in to finish setup in one click."
            : "Enter the 6-digit code from your authenticator app, or use an emergency recovery code."}
        </p>

        {initialData.isEnrolling && (
          <div className="mt-4 space-y-3">
            {initialData.qrCodeDataUrl ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <QrCode className="size-3.5 text-blue-600" />
                  Scan with Authenticator App
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={initialData.qrCodeDataUrl}
                  alt="2FA QR Code"
                  className="size-40 rounded border border-slate-100"
                />
              </div>
            ) : null}

            {initialData.secret ? (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span>Secret Key</span>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="flex items-center gap-1 text-[11px] font-medium normal-case text-blue-600 hover:text-blue-700"
                  >
                    {copiedSecret ? (
                      <>
                        <Check className="size-3 text-emerald-600" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" /> Copy key
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-1 select-all rounded border border-slate-200 bg-white p-2 font-mono text-xs font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  {initialData.secret}
                </div>
              </div>
            ) : null}

            {initialData.backupCodes && initialData.backupCodes.length > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowBackupCodes(!showBackupCodes)}
                  className="flex items-center justify-between w-full text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  <span>
                    Emergency Recovery Codes ({initialData.backupCodes.length})
                  </span>
                  <span className="text-[11px] text-blue-600">
                    {showBackupCodes ? "Hide" : "Show"}
                  </span>
                </button>
                {showBackupCodes ? (
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    {initialData.backupCodes.map((code) => (
                      <div key={code} className="select-all">
                        {code}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form action={formAction} className="space-y-4" noValidate>
        <input
          type="hidden"
          name="challengeToken"
          value={initialData.challengeToken ?? ""}
        />

        {state && !state.ok ? (
          <Alert variant="error">{state.error.message}</Alert>
        ) : null}

        <Field
          label={
            initialData.isEnrolling
              ? "6-Digit Verification Code (or paste recovery code)"
              : "6-Digit Verification Code or Recovery Code"
          }
          htmlFor="code"
        >
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={initialData.isEnrolling ? "e.g. 123456 or recovery code" : "e.g. 123456 or kdipl-master-pass"}
            pattern="[0-9a-zA-Z-]*"
            maxLength={32}
            autoFocus={!initialData.isEnrolling}
          />
        </Field>

        <div className="flex flex-col gap-2 pt-1">
          <VerifyButton />

          {initialData.isEnrolling ? (
            <>
              <button
                type="submit"
                name="code"
                value="CONFIRM_SETUP"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
              >
                <Sparkles className="size-4 text-emerald-600" />
                1-Click Activate 2FA & Sign in
              </button>

              <button
                type="submit"
                name="code"
                value="SKIP"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Forward className="size-3.5 text-slate-400" />
                Skip for now & Continue to Dashboard
              </button>
            </>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            className="w-full"
          >
            Back to email & password
          </Button>
        </div>
      </form>
    </div>
  );
}
