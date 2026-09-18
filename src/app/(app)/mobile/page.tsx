import { PageHeader } from "@/components/shared/page-header";
import { ApplicationState } from "@/components/ui/states";
import { MobileCaptureWorkspace } from "@/features/offline/mobile-capture-workspace";
import { requireCurrentPrincipal } from "@/server/auth/current-user";
import { canUseOfflineOperations } from "@/server/offline/reference-service";

export default async function MobileOperationsPage() {
  const principal = await requireCurrentPrincipal();
  if (!canUseOfflineOperations(principal)) {
    return (
      <ApplicationState
        kind="forbidden"
        title="Mobile offline operations are not assigned"
        description="Offline capture is restricted to Site Supervisors, Store Keepers, Purchase Managers and Project Managers."
      />
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Phase 9 · Mobile operations"
        title="Offline capture and synchronization"
        description="Capture authorized operational drafts, evidence and GPS on unreliable connections. Server authorization and workflow validation always run again during synchronization."
      />
      <MobileCaptureWorkspace principal={principal} />
    </div>
  );
}
