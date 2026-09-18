import { NextResponse } from "next/server";

import { getCurrentPrincipal } from "@/server/auth/current-user";
import {
  canUseOfflineOperations,
  getOfflineReferenceSnapshot,
} from "@/server/offline/reference-service";

export async function GET() {
  const principal = await getCurrentPrincipal();
  if (!principal) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!canUseOfflineOperations(principal)) {
    return NextResponse.json(
      { error: "Offline operations are not enabled for this role." },
      { status: 403 },
    );
  }
  return NextResponse.json(await getOfflineReferenceSnapshot(principal), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
