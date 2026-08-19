import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { requireCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";
import { redirect } from "next/navigation";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const principal = await requireCurrentPrincipal();
  if (!hasPermission(principal, "app.access")) redirect("/forbidden");
  return (
    <ToastProvider>
      <AppShell principal={principal}>{children}</AppShell>
    </ToastProvider>
  );
}
