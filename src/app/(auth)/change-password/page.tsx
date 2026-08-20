import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { getCurrentSession } from "@/server/auth/current-user";

export default async function ChangePasswordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.principal.mustChangePassword) redirect("/dashboard");
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10">
      <Card className="w-full max-w-lg border-white/10 shadow-2xl">
        <CardHeader>
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-blue-700 text-white">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-950">
            Set your private password
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your temporary password must be replaced before you can enter the
            KDIPL workspace.
          </p>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm required />
        </CardContent>
      </Card>
    </main>
  );
}
