import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ApplicationState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-50 p-5 sm:p-10">
      <ApplicationState
        kind="not-found"
        title="Page not found"
        description="The page may have moved, or the address may be incorrect."
        action={
          <Link href="/dashboard">
            <Button>Return to dashboard</Button>
          </Link>
        }
      />
    </main>
  );
}
