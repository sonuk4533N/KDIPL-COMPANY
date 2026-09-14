import path from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { db } from "@/db/prisma";
import { env } from "@/config/env";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { getCustomerMovementWorkspace } from "@/features/inventory/customer-movement-queries";
import { getStorageProvider } from "@/server/storage/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await getCurrentPrincipal();
  if (!principal) return new Response("Sign in required", { status: 401 });
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  try {
    const workspace = await getCustomerMovementWorkspace(
      principal,
      parsed.data,
    );
    if (!workspace.movements.length)
      return new Response("Not found", { status: 404 });
    const movement = await db.customerStockMovement.findUnique({
      where: { id: parsed.data },
      include: { evidence: true },
    });
    const file = movement?.evidence;
    if (!file || file.scanStatus !== "CLEAN")
      return new Response("Evidence unavailable", { status: 404 });
    if (file.storageProvider === "S3")
      return Response.redirect(
        await getStorageProvider().getAuthorizedUrl(file.storageKey, 60),
      );
    const root = path.resolve(env.FILE_STORAGE_LOCAL_PATH);
    const target = path.resolve(root, file.storageKey);
    if (!target.startsWith(`${root}${path.sep}`))
      return new Response("Not found", { status: 404 });
    const bytes = await readFile(target);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Evidence unavailable", { status: 404 });
  }
}
