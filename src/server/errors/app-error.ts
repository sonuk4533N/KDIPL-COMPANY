import type { AppErrorCode, CommandResult } from "@/types/application";

const publicMessages: Record<AppErrorCode, string> = {
  VALIDATION_ERROR: "Please review the highlighted information.",
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "The requested record could not be found.",
  CONFLICT: "This action conflicts with the current record state.",
  INSUFFICIENT_STOCK: "There is not enough available stock for this action.",
  INVALID_STATUS_TRANSITION: "This status change is not allowed.",
  DUPLICATE_TRANSACTION: "This transaction has already been submitted.",
  FILE_UPLOAD_ERROR: "The file could not be uploaded.",
  INTERNAL_ERROR: "Something went wrong. Please try again.",
};

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message = publicMessages[code],
    public readonly status = statusForCode(code),
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

function statusForCode(code: AppErrorCode) {
  return {
    VALIDATION_ERROR: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INSUFFICIENT_STOCK: 409,
    INVALID_STATUS_TRANSITION: 409,
    DUPLICATE_TRANSACTION: 409,
    FILE_UPLOAD_ERROR: 422,
    INTERNAL_ERROR: 500,
  }[code];
}

export function toCommandError(error: unknown): CommandResult<never> {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message, fields: error.fields },
    };
  }
  const databaseCode =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : null;
  if (databaseCode === "P2002") {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "A record with that code, name, or email already exists.",
      },
    };
  }
  if (databaseCode === "P2003") {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "A selected related record is no longer available.",
      },
    };
  }
  if (databaseCode === "P2025") {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: publicMessages.NOT_FOUND },
    };
  }
  return {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: publicMessages.INTERNAL_ERROR },
  };
}
