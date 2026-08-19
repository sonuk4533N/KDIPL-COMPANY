import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ApplicationState } from "@/components/ui/states";

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-5 sm:p-10">
      <ApplicationState
        kind="forbidden"
        title="Access not permitted"
        description="Your account does not have permission to view this area."
        action={
          <Link href="/dashboard">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        }
      />
    </main>
  );
}
