import { notFound } from "next/navigation";
import { CircleDot, FileClock } from "lucide-react";

import { ApplicationState } from "@/components/ui/states";
import { traceabilityChain } from "@/features/reporting/traceability";
import { requireCurrentPrincipal } from "@/server/auth/current-user";

export default async function TraceabilityPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const principal = await requireCurrentPrincipal();
  const { kind, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const trace = await traceabilityChain(principal, kind, id);
  if (!trace)
    return (
      <ApplicationState
        kind="forbidden"
        title="Trace unavailable"
        description="The record does not exist or is outside your current permission and assignment scope."
      />
    );
  return (
    <main className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">
          End-to-end traceability
        </p>
        <h1 className="text-2xl font-semibold">{trace.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{trace.context}</p>
      </div>
      <ol className="relative ml-3 border-l-2 border-slate-200">
        {trace.nodes.map((node) => (
          <li
            key={`${node.stage}-${node.id}`}
            className="relative mb-5 ml-7 rounded-xl border bg-white p-4"
          >
            <span className="absolute -left-10 top-4 grid size-6 place-items-center rounded-full bg-blue-600 text-white">
              <CircleDot className="size-3" />
            </span>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  {node.stage}
                </p>
                <h2 className="font-semibold">{node.number}</h2>
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">
                {String(node.status).replaceAll("_", " ")}
              </span>
            </div>
            {node.detail && (
              <p className="mt-2 text-sm text-slate-700">{node.detail}</p>
            )}
            {node.reason && (
              <p className="mt-2 text-sm text-slate-500">
                Reason: {node.reason}
              </p>
            )}
            <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
              <FileClock className="size-3" />{" "}
              {new Intl.DateTimeFormat("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Kolkata",
              }).format(node.timestamp)}{" "}
              · {node.actor}
            </p>
          </li>
        ))}
      </ol>
    </main>
  );
}
