import { db } from "@/db/prisma";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const principal = await getCurrentPrincipal();
  if (!principal) return new Response("Unauthorized", { status: 401 });
  if (!hasPermission(principal, "tally.export"))
    return new Response("Forbidden", { status: 403 });
  const { id } = await context.params;
  const event = await db.tallyExportEvent.findFirst({
    where: { id, status: { in: ["EXPORTED", "ACKNOWLEDGED"] } },
  });
  if (!event) return new Response("Not found", { status: 404 });
  return new Response(event.payload, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${event.exportNumber}.xml"`,
      "x-content-sha256": event.checksum,
    },
  });
}
