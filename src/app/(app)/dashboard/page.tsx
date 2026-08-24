import { Activity, Database, FileCheck2, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireCurrentPrincipal } from "@/server/auth/current-user";

const foundation = [
  {
    label: "Database foundation",
    detail: "PostgreSQL + Prisma migrations",
    icon: Database,
    status: "Completed" as const,
  },
  {
    label: "Access control",
    detail: "Server-side RBAC and secure sessions",
    icon: ShieldCheck,
    status: "Completed" as const,
  },
  {
    label: "Audit infrastructure",
    detail: "Sanitized, transaction-aware events",
    icon: Activity,
    status: "Completed" as const,
  },
  {
    label: "Project foundation",
    detail: "Projects, sites, assignments, and masters",
    icon: FileCheck2,
    status: "Completed" as const,
  },
];

export default async function DashboardPage() {
  const principal = await requireCurrentPrincipal();
  return (
    <div>
      <PageHeader
        eyebrow="Phase 2 foundation"
        title={`Good day, ${principal.displayName.split(" ")[0]}.`}
        description="The KDIPL Operations Platform now includes secure project operations and governed master data."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {foundation.map((item) => (
          <Card key={item.label}>
            <CardContent>
              <div className="mb-5 flex items-start justify-between">
                <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <item.icon className="size-5" />
                </div>
                <StatusBadge status={item.status} />
              </div>
              <h3 className="font-display text-base font-bold text-slate-900">
                {item.label}
              </h3>
              <p className="mt-2 text-sm leading-5 text-slate-500">
                {item.detail}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">
                  Engineering foundation
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Capabilities established before business transactions begin.
                </p>
              </div>
              <span
                className="size-2 rounded-full bg-emerald-500"
                aria-label="Foundation active"
              />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Security
                </p>
                <p className="mt-2 text-sm font-semibold">
                  Opaque sessions, Argon2id, secure cookies
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Integrity
                </p>
                <p className="mt-2 text-sm font-semibold">
                  Atomic transactions and sequence generation
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Traceability
                </p>
                <p className="mt-2 text-sm font-semibold">
                  Reusable audit and structured logging
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Quality
                </p>
                <p className="mt-2 text-sm font-semibold">
                  Unit, integration, E2E, and CI baseline
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h3 className="font-display text-lg font-bold">
              Phase 2 delivered
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              The project and master-data foundation is ready for the later
              transaction workflows.
            </p>
            <div className="mt-6 space-y-3">
              {[
                "Client and project portfolio",
                "Sites and responsible teams",
                "Material and unit masters",
                "Supplier directory and contacts",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 text-sm text-slate-700"
                >
                  <span className="size-1.5 rounded-full bg-blue-600" />
                  {item}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
