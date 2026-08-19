import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE_NAME,
  validateSessionToken,
} from "@/server/auth/session";
import type { AuthenticatedPrincipal } from "@/types/application";

export async function getCurrentPrincipal(): Promise<AuthenticatedPrincipal | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await validateSessionToken(token);
  return session?.principal ?? null;
}

export async function requireCurrentPrincipal(): Promise<AuthenticatedPrincipal> {
  const principal = await getCurrentPrincipal();
  if (!principal) redirect("/login");
  return principal;
}
