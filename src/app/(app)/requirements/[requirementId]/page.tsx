import { notFound } from "next/navigation";
import { z } from "zod";

import { RequirementDetailView } from "@/features/requirements/requirement-detail-view";
import { getRequirementDetail } from "@/features/requirements/requirement-queries";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function RequirementDetailPage({
  params,
}: {
  params: Promise<{ requirementId: string }>;
}) {
  const { requirementId } = await params;
  if (!z.string().uuid().safeParse(requirementId).success) notFound();
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "material_requirement.view")) {
    notFound();
  }
  const detail = await getRequirementDetail(principal, requirementId);
  if (!detail) notFound();
  const canEdit =
    hasPermission(principal, "material_requirement.create") &&
    detail.requirement.createdById === principal.userId &&
    detail.projects.some(
      (project) => project.id === detail.requirement.project.id,
    );
  return <RequirementDetailView detail={detail} canEdit={canEdit} />;
}
