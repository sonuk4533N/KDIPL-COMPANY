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
  const [sessions, activity] = await Promise.all([
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
        description="Maintain your password and review where your KDIPL account is signed in."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
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
      </div>
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
