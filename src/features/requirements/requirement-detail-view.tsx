import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  History,
  MapPin,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { RequirementDraftForm } from "@/features/requirements/requirement-form";
import type { RequirementDetail } from "@/features/requirements/requirement-queries";
import { RequirementWorkflowControls } from "@/features/requirements/requirement-workflow-controls";

function actionLabel(action: string) {
  return (
    {
      SUBMIT: "Submitted",
      APPROVE: "Approved",
      REJECT: "Rejected",
      SEND_BACK: "Sent back",
    }[action] ?? action
  );
}

export function RequirementDetailView({
  detail,
}: {
  detail: RequirementDetail;
}) {
  const { requirement } = detail;
  const { canEdit, canSubmit, canDecide } = requirement.capabilities;
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
        action={<StatusBadge status={requirement.statusLabel} />}
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
            <ClipboardCheck className="size-5 text-blue-700" />
            <p className="mt-3 text-xs text-slate-500">Material lines</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {requirement.lines.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Created by {requirement.createdBy.displayName}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Approval workflow
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Site Supervisor submissions require a different assigned Project
            Manager. Project Manager submissions require a different Project
            Director. System Administrators cannot business-approve.
          </p>
        </CardHeader>
        <CardContent>
          <RequirementWorkflowControls
            requirementId={requirement.id}
            canSubmit={canSubmit}
            canDecide={canDecide}
          />
          {!canSubmit && !canDecide ? (
            <Alert>
              No workflow action is available to your account for this
              requirement in its current state.
            </Alert>
          ) : null}
          {requirement.submittedBy ? (
            <p className="mt-4 text-sm text-slate-600">
              Submitted by {requirement.submittedBy.displayName} as{" "}
              {requirement.submittedByRole === "PROJECT_MANAGER"
                ? "Project Manager"
                : "Site Supervisor"}
              {requirement.submittedAt
                ? ` on ${new Date(requirement.submittedAt).toLocaleString("en-IN")}`
                : ""}
              .
            </p>
          ) : null}
          {requirement.decidedBy ? (
            <p className="mt-2 text-sm text-slate-600">
              Decided by {requirement.decidedBy.displayName}
              {requirement.decidedAt
                ? ` on ${new Date(requirement.decidedAt).toLocaleString("en-IN")}`
                : ""}
              .
            </p>
          ) : null}
          {requirement.decisionReason ? (
            <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {requirement.decisionReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-950">
            <History className="size-5 text-blue-700" />
            Workflow history
          </h2>
        </CardHeader>
        <CardContent>
          {requirement.workflowEvents.length ? (
            <ol className="space-y-4">
              {requirement.workflowEvents.map((event) => (
                <li key={event.id} className="border-l-2 border-blue-200 pl-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {actionLabel(event.action)} by{" "}
                      {event.actorUser.displayName}
                    </p>
                    <time className="text-xs text-slate-500">
                      {new Date(event.createdAt).toLocaleString("en-IN")}
                    </time>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.fromStatusLabel} → {event.toStatusLabel}
                  </p>
                  {event.reason ? (
                    <p className="mt-2 text-sm text-slate-700">
                      {event.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">
              No workflow events yet. Draft saves remain available in the audit
              trail.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
