import "server-only";

import { db } from "@/db/prisma";

export interface NotificationAdapter {
  channel: "IN_APP" | "WHATSAPP";
  deliver(payload: unknown): Promise<{ reference: string }>;
}

// Provider-neutral contract. A WhatsApp provider must be selected and configured
// operationally before a worker registers an implementation.
export async function enqueueInvoiceDueNotifications(now = new Date()) {
  const soon = new Date(now.getTime() + 3 * 86_400_000);
  const invoices = await db.supplierInvoice.findMany({
    where: {
      status: { in: ["APPROVED", "PARTIALLY_PAID"] },
      dueDate: { lte: soon },
    },
    select: { id: true, internalNumber: true, dueDate: true },
  });
  for (const invoice of invoices) {
    const overdue = invoice.dueDate < now;
    const eventType = overdue
      ? "SUPPLIER_INVOICE_OVERDUE"
      : "SUPPLIER_INVOICE_DUE_SOON";
    const day = now.toISOString().slice(0, 10);
    await db.notificationOutbox.upsert({
      where: { dedupeKey: `${eventType}:${invoice.id}:${day}` },
      update: {},
      create: {
        dedupeKey: `${eventType}:${invoice.id}:${day}`,
        eventType,
        entityType: "SUPPLIER_INVOICE",
        entityId: invoice.id,
        recipientRole: "ACCOUNTS",
        channels: ["IN_APP", "WHATSAPP"],
        payload: {
          invoiceNumber: invoice.internalNumber,
          dueDate: invoice.dueDate.toISOString().slice(0, 10),
        },
      },
    });
  }
  return invoices.length;
}
