"use client";

import { useActionState, useEffect } from "react";
import { Laptop, LogOut, Smartphone } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "@/features/auth/security-actions";

export type SessionRow = {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
  userAgent: string;
};

function deviceLabel(userAgent: string) {
  if (!userAgent) return "Unknown device";
  const mobile = /mobile|android|iphone/i.test(userAgent);
  const browser = /edg/i.test(userAgent)
    ? "Edge"
    : /chrome/i.test(userAgent)
      ? "Chrome"
      : /firefox/i.test(userAgent)
        ? "Firefox"
        : /safari/i.test(userAgent)
          ? "Safari"
          : "Browser";
  return `${mobile ? "Mobile" : "Computer"} · ${browser}`;
}

function RevokeButton({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(
    async () => revokeSessionAction(sessionId),
    null,
  );
  useEffect(() => {
    if (state && !state.ok) window.alert(state.error.message);
  }, [state]);
  return (
    <form action={action}>
      <Button type="submit" size="sm" variant="tertiary" disabled={pending}>
        {pending ? "Revoking..." : "Revoke"}
      </Button>
    </form>
  );
}

export function SessionManagement({ sessions }: { sessions: SessionRow[] }) {
  const [state, action, pending] = useActionState(
    async () => revokeOtherSessionsAction(),
    null,
  );
  const otherCount = sessions.filter((session) => !session.current).length;
  return (
    <div className="space-y-4">
      {state && !state.ok ? (
        <Alert variant="error">{state.error.message}</Alert>
      ) : null}
      {state?.ok ? (
        <Alert variant="success">Other sessions were revoked.</Alert>
      ) : null}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {sessions.map((session) => {
          const mobile = /mobile|android|iphone/i.test(session.userAgent);
          const DeviceIcon = mobile ? Smartphone : Laptop;
          return (
            <div
              key={session.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
            >
              <div className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <DeviceIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">
                    {deviceLabel(session.userAgent)}
                  </p>
                  {session.current ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      This device
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">
                  Last active {new Date(session.lastSeenAt).toLocaleString()} ·
                  Expires {new Date(session.absoluteExpiresAt).toLocaleString()}
                </p>
              </div>
              {!session.current ? (
                <RevokeButton sessionId={session.id} />
              ) : null}
            </div>
          );
        })}
      </div>
      {otherCount ? (
        <form action={action}>
          <Button type="submit" variant="secondary" disabled={pending}>
            <LogOut className="size-4" />
            {pending ? "Revoking..." : "Sign out all other devices"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-slate-500">No other active sessions.</p>
      )}
    </div>
  );
}
