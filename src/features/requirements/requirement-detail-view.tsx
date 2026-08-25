import { ArrowLeft, CalendarDays, LockKeyhole, MapPin } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { RequirementDraftForm } from "@/features/requirements/requirement-form";
import type { RequirementDetail } from "@/features/requirements/requirement-queries";

export function RequirementDetailView({
  detail,
  canEdit,
}: {
  detail: RequirementDetail;
  canEdit: boolean;
}) {
  const { requirement } = detail;
  return (
    <div className="space-y-7">
      <ButtonLink href="/requirements" variant="tertiary" className="px-0">
        <ArrowLeft className="size-4" />
        Back to requirements
      </ButtonLink>
      <PageHeader
        eyebrow={requirement.requirementNumber}
        title={requirement.purpose}
        description={`${requirement.project.name} · ${requirement.site.name}`}
        action={<StatusBadge status="Draft" />}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent>
            <MapPin className="size-5 text-blue-700" />
            <p className="mt-3 text-xs text-slate-500">Project / site</p>
            <p className="mt-1 font-semibold text-slate-900">
              {requirement.project.projectCode} · {requirement.site.siteCode}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CalendarDays className="size-5 text-blue-700" />
            <p className="mt-3 text-xs text-slate-500">Needed by</p>
            <p className="mt-1 font-semibold text-slate-900">
              {requirement.neededBy}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-slate-500">Material lines</p>
            <p className="mt-2 font-display text-3xl font-extrabold text-slate-950">
              {requirement.lines.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Created by {requirement.createdBy.displayName}
            </p>
          </CardContent>
        </Card>
      </div>
      <Alert>
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <LockKeyhole className="size-4" />
            Approval workflow is locked
          </p>
          <p className="mt-1">
            This record remains a draft until KDIPL confirms approval levels,
            delegation, thresholds, and self-approval restrictions.
          </p>
        </div>
      </Alert>
      {canEdit ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Edit draft requirement
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Changes and removed lines remain represented in audit evidence.
            </p>
          </CardHeader>
          <CardContent>
            <RequirementDraftForm
              projects={detail.projects}
              materials={detail.materials}
              requirement={requirement}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Material lines
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {requirement.lines.map((line) => (
              <div
                key={line.id}
                className="flex flex-col justify-between gap-2 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {line.material.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {line.material.materialCode}
                    {line.notes ? ` · ${line.notes}` : ""}
                  </p>
                </div>
                <p className="font-display text-lg font-bold text-slate-950">
                  {line.quantity} {line.unit.symbol}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
