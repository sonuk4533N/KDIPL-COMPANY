import { ArrowRight, ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { ApplicationState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shared/page-header";

export function ModulePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div>
      <PageHeader
        eyebrow="Foundation route"
        title={title}
        description={description}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <ApplicationState
          kind="empty"
          title={`${title} is ready for its business phase`}
          description="The protected route, navigation, responsive layout, authorization boundary, and standard application states are in place. Business records are intentionally not implemented in Phase 0."
        />
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="size-4 text-emerald-700" />
              Foundation status
            </div>
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Route security</span>
                <StatusBadge status="Completed" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  Business workflow
                </span>
                <StatusBadge status="Pending" />
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Scheduled milestone
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {phase}
                  <ArrowRight className="size-4" />
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
