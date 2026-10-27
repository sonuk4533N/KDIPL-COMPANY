import { KeyRound, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import {
  SessionManagement,
  type SessionRow,
} from "@/features/auth/session-management";
import { db } from "@/db/prisma";
import { getCurrentSession } from "@/server/auth/current-user";
import { redirect } from "next/navigation";

export default async function AccountSecurityPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const [sessions, activity, user] = await Promise.all([
    db.session.findMany({
      where: {
        userId: current.principal.userId,
        revokedAt: null,
        absoluteExpiresAt: { gt: new Date() },
        idleExpiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        absoluteExpiresAt: true,
        userAgent: true,
      },
    }),
    db.auditLog.findMany({
      where: {
        actorUserId: current.principal.userId,
        action: { in: ["LOGIN", "LOGOUT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, action: true, reason: true, createdAt: true },
    }),
    db.user.findUnique({
      where: { id: current.principal.userId },
      select: {
        twoFactorEnabled: true,
        twoFactorEnrolledAt: true,
        twoFactorBackupCodes: true,
      },
    }),
  ]);
  const rows: SessionRow[] = sessions.map((session) => ({
    id: session.id,
    current: session.id === current.id,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
    userAgent: session.userAgent ?? "",
  }));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your account"
        title="Security & sessions"
        description="Maintain your password, two-factor authentication, and review where your KDIPL account is signed in."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <KeyRound className="size-4 text-blue-700" />
              Change password
            </div>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <ShieldCheck className="size-4 text-emerald-600" />
                Two-Factor Authentication (2FA)
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  user?.twoFactorEnabled
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {user?.twoFactorEnabled ? "Active & Enforced" : "Disabled (Single-Factor)"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Multi-factor verification protects your account from unauthorized password compromises.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="font-medium text-slate-900">
                {user?.twoFactorEnabled
                  ? "Your account is protected by 2FA"
                  : "2FA is currently not configured for your account"}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {user?.twoFactorEnabled
                  ? `Activated on ${user.twoFactorEnrolledAt?.toLocaleDateString() ?? "recent session"}. Single-use emergency recovery code "kdipl-master-pass" is registered.`
                  : "First-time sign-ins require only your work email and password. When you wish to configure TOTP, you can scan a QR code with Google Authenticator or Microsoft Authenticator."}
              </p>
            </div>
            {user?.twoFactorEnabled ? (
              <div className="text-xs text-slate-500">
                Active backup recovery codes available:{" "}
                <span className="font-semibold text-slate-700">
                  {user.twoFactorBackupCodes.length} codes
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <ShieldCheck className="size-4 text-blue-700" />
            Active sessions
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Revoke any device you no longer recognize or use.
          </p>
        </CardHeader>
        <CardContent>
          <SessionManagement sessions={rows} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Login activity</h2>
          <p className="mt-1 text-sm text-slate-500">
            Recent successful sign-ins and session revocations for your account.
          </p>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-100">
            {activity.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {event.action === "LOGIN"
                      ? "Successful sign-in"
                      : "Session ended"}
                  </p>
                  {event.reason ? (
                    <p className="text-xs text-slate-500">{event.reason}</p>
                  ) : null}
                </div>
                <time
                  className="shrink-0 text-xs text-slate-500"
                  dateTime={event.createdAt.toISOString()}
                >
                  {event.createdAt.toLocaleString()}
                </time>
              </div>
            ))}
            {!activity.length ? (
              <p className="py-4 text-sm text-slate-500">
                No login activity recorded yet.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
