import { NextResponse } from "next/server";

import { getCurrentSession } from "@/server/auth/current-user";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  return NextResponse.json(
    {
      userId: session.principal.userId,
      employeeId: session.principal.employeeId,
      authenticatedAt: new Date().toISOString(),
      sessionId: session.id,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
