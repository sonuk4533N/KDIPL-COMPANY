import { NextResponse } from "next/server";

import { db } from "@/db/prisma";
import { logger } from "@/server/logging/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "reachable",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error, event: "health.database_unreachable" });
    return NextResponse.json(
      {
        status: "degraded",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
