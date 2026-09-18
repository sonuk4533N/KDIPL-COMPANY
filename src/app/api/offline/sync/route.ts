import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { consumeOperationAttempt } from "@/server/auth/rate-limit";
import { AppError } from "@/server/errors/app-error";
import {
  acceptOfflineSubmission,
  OfflineConflictError,
} from "@/server/offline/sync-service";

const MAX_SYNC_REQUEST_BYTES = 1_048_576;

export async function POST(request: Request) {
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    if (!principal) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    await consumeOperationAttempt(`offline-sync:${principal.userId}`, 30);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_SYNC_REQUEST_BYTES) {
      return NextResponse.json(
        { error: "Synchronization request is too large." },
        { status: 413 },
      );
    }
    const result = await acceptOfflineSubmission(
      principal,
      await request.json(),
    );
    return NextResponse.json(result, {
      status: result.duplicate ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OfflineConflictError) {
      return NextResponse.json(
        { error: "Synchronization conflict.", conflict: error.conflict },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Review the offline draft data.",
          issues: error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Synchronization failed safely." },
      { status: 500 },
    );
  }
}
