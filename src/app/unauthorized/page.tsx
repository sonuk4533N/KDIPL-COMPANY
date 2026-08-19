import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ApplicationState } from "@/components/ui/states";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-5 sm:p-10">
      <ApplicationState
        kind="unauthorized"
        title="Sign in required"
        description="Your session may have expired. Sign in again to continue securely."
        action={
          <Link href="/login">
            <Button>Sign in</Button>
          </Link>
        }
      />
    </main>
  );
}
