import { db } from "@/db/prisma";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function Page() {
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "notification.view"))
    return <p>You do not have permission to view notifications.</p>;
  const support = principal.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  const events = await db.notificationOutbox.findMany({
    where: support ? {} : { recipientRole: { in: [...principal.roleCodes] } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <main className="space-y-5">
      <div>
        <p className="text-sm font-medium text-blue-700">In-app outbox</p>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-slate-600">
          WhatsApp delivery uses a replaceable adapter; no provider credentials
          are hard-coded.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {events.map((event) => (
          <article key={event.id} className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold">
              {event.eventType.replaceAll("_", " ")}
            </h2>
            <p className="text-sm">
              {event.entityType} · {event.status}
            </p>
            <p className="text-xs text-slate-500">
              Reminder{" "}
              {event.remindAt?.toLocaleString("en-IN") ?? "not scheduled"} ·
              escalation{" "}
              {event.escalateAt?.toLocaleString("en-IN") ?? "not scheduled"}
            </p>
          </article>
        ))}
        {events.length === 0 && <p>No notifications.</p>}
      </div>
    </main>
  );
}
