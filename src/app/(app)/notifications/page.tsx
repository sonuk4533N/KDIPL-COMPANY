import { Bell, CheckCircle2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ApplicationState } from "@/components/ui/states";
import { db } from "@/db/prisma";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function NotificationsPage() {
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "notification.view")) {
    return (
      <ApplicationState
        kind="forbidden"
        title="Notifications access required"
        description="You do not have permission to view operational notification queues."
      />
    );
  }

  const support = principal.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  const events = await db.notificationOutbox.findMany({
    where: support ? {} : { recipientRole: { in: [...principal.roleCodes] } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communications & Alerts"
        title="Operational Notifications"
        description="Real-time alert dispatch log, approval reminders, and escalation monitoring across KDIPL workflows."
      />

      {events.length === 0 ? (
        <Card className="border-slate-200 bg-white">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-6" />
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-slate-900">
              All caught up
            </h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              You have zero pending notification outbox events or escalations in
              your role queue.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((event) => (
            <Card
              key={event.id}
              className="border-slate-200 bg-white shadow-xs transition hover:border-blue-300"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-lg bg-blue-50 text-blue-700">
                      <Bell className="size-4" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {event.eventType.replaceAll("_", " ")}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {event.entityType} · Role: {event.recipientRole}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      event.status === "SENT"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {event.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                  <span>
                    Remind:{" "}
                    {event.remindAt
                      ? new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(event.remindAt))
                      : "Not scheduled"}
                  </span>
                  <span>
                    Escalation:{" "}
                    {event.escalateAt
                      ? new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(event.escalateAt))
                      : "Not scheduled"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
