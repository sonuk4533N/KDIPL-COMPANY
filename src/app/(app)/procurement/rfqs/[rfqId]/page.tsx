import { notFound } from "next/navigation";
import { z } from "zod";

import { RfqDetailView } from "@/features/procurement/rfq-detail-view";
import { getRfqDetail } from "@/features/procurement/rfq-queries";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function RfqDetailPage({
  params,
}: {
  params: Promise<{ rfqId: string }>;
}) {
  const { rfqId } = await params;
  if (!z.string().uuid().safeParse(rfqId).success) notFound();
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "purchase.view")) notFound();
  const detail = await getRfqDetail(principal, rfqId);
  if (!detail) notFound();
  return <RfqDetailView detail={detail} />;
}
