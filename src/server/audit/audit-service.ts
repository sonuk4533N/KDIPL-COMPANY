import "server-only";

import { Prisma, type AuditAction } from "@/generated/prisma/client";

const sensitiveKey =
  /password|secret|token|cookie|authorization|credential|documentcontents/i;

export interface AuditEvent {
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  metadata?: unknown;
}

export function sanitizeAuditValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item) ?? null);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key)
          ? "[REDACTED]"
          : (sanitizeAuditValue(item) ?? null),
      ]),
    );
  }
  return String(value);
}

export const AuditService = {
  async record(event: AuditEvent, transaction: Prisma.TransactionClient) {
    const before = sanitizeAuditValue(event.before);
    const after = sanitizeAuditValue(event.after);
    const metadata = sanitizeAuditValue(event.metadata);
    return transaction.auditLog.create({
      data: {
        actorUserId: event.actorUserId ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        before:
          before === null
            ? Prisma.JsonNull
            : (before as Prisma.InputJsonValue | undefined),
        after:
          after === null
            ? Prisma.JsonNull
            : (after as Prisma.InputJsonValue | undefined),
        reason: event.reason,
        metadata:
          metadata === null
            ? Prisma.JsonNull
            : (metadata as Prisma.InputJsonValue | undefined),
      },
    });
  },
};
