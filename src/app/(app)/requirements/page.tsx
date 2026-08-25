import { ClipboardList, FilePenLine, Plus, Send } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApplicationState } from "@/components/ui/states";
import { RequirementDraftForm } from "@/features/requirements/requirement-form";
import { RequirementList } from "@/features/requirements/requirement-list";
import { getRequirementWorkspace } from "@/features/requirements/requirement-queries";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function RequirementsPage() {
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "material_requirement.view")) {
    return (
      <ApplicationState
        kind="forbidden"
        title="Requirement access required"
        description="You need material requirement visibility and an active project or site assignment to use this workspace."
      />
    );
  }
  const workspace = await getRequirementWorkspace(principal);
  const canCreate = hasPermission(principal, "material_requirement.create");
  const lineCount = workspace.requirements.reduce(
    (total, requirement) => total + requirement.lines.length,
    0,
  );
  const submittedCount = workspace.requirements.filter(
    ({ status }) => status === "SUBMITTED",
  ).length;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Phase 3 · Draft foundation"
        title="Material requirements"
        description="Capture project-site demand, submit it through assignment-based approval, and retain a complete decision history."
        action={
          canCreate &&
          workspace.projects.length &&
          workspace.materials.length ? (
            <ButtonLink href="#new-requirement">
              <Plus className="size-4" />
              New draft
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <ClipboardList className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Visible requirements</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {workspace.requirements.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <FilePenLine className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Material lines</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {lineCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Send className="size-5 text-amber-700" />
            <p className="mt-3 text-sm text-slate-500">Awaiting approval</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {submittedCount}
            </p>
          </CardContent>
        </Card>
      </div>
      {canCreate && workspace.projects.length && workspace.materials.length ? (
        <Card id="new-requirement" className="scroll-mt-28">
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Create draft requirement
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A unique MR number is assigned only after the server commits the
              complete draft and audit evidence.
            </p>
          </CardHeader>
          <CardContent>
            <RequirementDraftForm
              projects={workspace.projects}
              materials={workspace.materials}
            />
          </CardContent>
        </Card>
      ) : canCreate ? (
        <ApplicationState
          kind="empty"
          title="Draft prerequisites are missing"
          description="Create an open project site and at least one active material before starting a requirement."
        />
      ) : null}
      <RequirementList requirements={workspace.requirements} />
    </div>
  );
}
