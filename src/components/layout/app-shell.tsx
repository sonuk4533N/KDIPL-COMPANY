import { BottomNavigation } from "@/components/layout/bottom-navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import type { AuthenticatedPrincipal } from "@/types/application";

export function AppShell({
  principal,
  children,
}: {
  principal: AuthenticatedPrincipal;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar principal={principal} />
      <div className="min-h-screen md:pl-60">
        <Header principal={principal} />
        <main className="mx-auto w-full max-w-[1600px] p-4 pb-24 md:p-6 md:pb-8 lg:p-8">
          {children}
        </main>
      </div>
      <BottomNavigation principal={principal} />
    </div>
  );
}
