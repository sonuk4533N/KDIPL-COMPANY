import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthenticatedPrincipal } from "@/types/application";
import { nextFinanceNumber } from "./numbering";

export interface TallyExportAdapter {
  serialize(input: TallyTransaction): string;
}

export interface TallyTransaction {
  entityType: string;
  entityId: string;
  number: string;
  date: Date;
  supplier: string;
  amount: string;
  gst?: string;
  tds?: string;
  rcm?: boolean;
  project?: string;
  reference?: string;
}

function xml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const tallyPrimeXmlAdapter: TallyExportAdapter = {
  serialize(input) {
    return [
      "<ENVELOPE>",
      "<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
      "<BODY><IMPORTDATA><REQUESTDATA>",
      `<VOUCHER REMOTEID="${xml(input.entityType)}:${xml(input.entityId)}">`,
      `<DATE>${input.date.toISOString().slice(0, 10).replaceAll("-", "")}</DATE>`,
      `<VOUCHERNUMBER>${xml(input.number)}</VOUCHERNUMBER>`,
      `<REFERENCE>${xml(input.reference)}</REFERENCE>`,
      `<PARTYLEDGERNAME>${xml(input.supplier)}</PARTYLEDGERNAME>`,
      `<AMOUNT>${xml(input.amount)}</AMOUNT>`,
      `<GSTAMOUNT>${xml(input.gst)}</GSTAMOUNT>`,
      `<TDSAMOUNT>${xml(input.tds)}</TDSAMOUNT>`,
      `<ISREVERSECHARGE>${input.rcm ? "Yes" : "No"}</ISREVERSECHARGE>`,
      `<COSTCENTRE>${xml(input.project)}</COSTCENTRE>`,
      "</VOUCHER></REQUESTDATA></IMPORTDATA></BODY>",
      "</ENVELOPE>",
    ].join("");
  },
};

export async function queueTallyExport(
  tx: Prisma.TransactionClient,
  principal: Pick<AuthenticatedPrincipal, "userId">,
  transaction: TallyTransaction,
) {
  const idempotencyKey = `${transaction.entityType}:${transaction.entityId}:FINAL`;
  const existing = await tx.tallyExportEvent.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) return existing;
  const payload = tallyPrimeXmlAdapter.serialize(transaction);
  const checksum = createHash("sha256").update(payload).digest("hex");
  return tx.tallyExportEvent.create({
    data: {
      exportNumber: await nextFinanceNumber(
        tx,
        "TALLY_EXPORT",
        transaction.date,
      ),
      entityType: transaction.entityType,
      entityId: transaction.entityId,
      idempotencyKey,
      payload,
      checksum,
      createdById: principal.userId,
    },
    select: { id: true },
  });
}

export async function recordTallyAttempt(
  tx: Prisma.TransactionClient,
  exportId: string,
  result: { ok: true } | { ok: false; error: string },
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`tally:${exportId}`}))::text`;
  const event = await tx.tallyExportEvent.findUniqueOrThrow({
    where: { id: exportId },
  });
  if (["EXPORTED", "ACKNOWLEDGED"].includes(event.status)) return event;
  const attemptNumber = event.attemptCount + 1;
  await tx.tallyExportAttempt.create({
    data: {
      exportEventId: event.id,
      attemptNumber,
      status: result.ok ? "EXPORTED" : "FAILED",
      payload: event.payload,
      checksum: event.checksum,
      error: result.ok ? null : result.error,
    },
  });
  if (!result.ok)
    await tx.notificationOutbox.create({
      data: {
        eventType: "TALLY_EXPORT_FAILED",
        entityType: "TALLY_EXPORT",
        entityId: event.id,
        recipientRole: "ACCOUNTS",
        channels: ["IN_APP", "WHATSAPP"],
        payload: { exportNumber: event.exportNumber, error: result.error },
      },
    });
  return tx.tallyExportEvent.update({
    where: { id: event.id },
    data: {
      status: result.ok ? "EXPORTED" : "FAILED",
      attemptCount: attemptNumber,
      lastAttemptAt: new Date(),
      lastError: result.ok ? null : result.error,
    },
  });
}
