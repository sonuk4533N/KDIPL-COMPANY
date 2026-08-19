import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2, LockKeyhole, ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentPrincipal } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentPrincipal()) redirect("/dashboard");
  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-blue-600 font-display text-xl font-extrabold">
            K
          </div>
          <div>
            <p className="font-display text-lg font-extrabold">KDIPL</p>
            <p className="text-[11px] uppercase tracking-[0.17em] text-slate-400">
              Business operations
            </p>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-400">
            <span className="size-2 rounded-full bg-emerald-400" />
            Secure operational workspace
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-tight">
            One accountable system for every KDIPL operation.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">
            A reliable foundation for projects, procurement, inventory,
            accounts, approvals, and audit-ready decisions.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <ShieldCheck className="mb-3 size-5 text-emerald-400" />
              <p className="font-semibold">Server-authorized</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Permissions and sessions are enforced on the server.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <Building2 className="mb-3 size-5 text-blue-400" />
              <p className="font-semibold">Built for KDIPL</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Designed around real operational responsibility.
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Kumar Designs India Private Limited
        </p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-xl bg-blue-700 font-display font-extrabold text-white">
              K
            </div>
            <div>
              <p className="font-display font-extrabold">KDIPL</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                Operations platform
              </p>
            </div>
          </div>
          <Card className="shadow-card">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-7">
                <div className="mb-4 grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <LockKeyhole className="size-5" />
                </div>
                <h2 className="font-display text-2xl font-extrabold">
                  Welcome back
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Sign in with your authorized KDIPL account.
                </p>
              </div>
              <LoginForm />
            </CardContent>
          </Card>
          <p className="mt-5 text-center text-xs text-slate-500">
            Sessions expire automatically. Never share your password.
          </p>
        </div>
      </section>
    </main>
  );
}
