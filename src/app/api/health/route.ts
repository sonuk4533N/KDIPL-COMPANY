import { NextResponse } from "next/server";

import { env } from "@/config/env";
import { db } from "@/db/prisma";
import { logger } from "@/server/logging/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - startTime;

    return NextResponse.json({
      status: "ok",
      releaseSha: env.RELEASE_SHA || "development",
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: "reachable",
        latencyMs: dbLatencyMs,
      },
      storage: {
        provider: env.FILE_STORAGE_PROVIDER,
        status: "configured",
      },
      scanner: {
        provider: env.FILE_SCANNER_PROVIDER,
        status:
          env.FILE_SCANNER_PROVIDER === "local" ? "local_active" : "configured",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error, event: "health.database_unreachable" });
    return NextResponse.json(
      {
        status: "degraded",
        releaseSha: env.RELEASE_SHA || "development",
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
          status: "unreachable",
        },
        storage: {
          provider: env.FILE_STORAGE_PROVIDER,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
