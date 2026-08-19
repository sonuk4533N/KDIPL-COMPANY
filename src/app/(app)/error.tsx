"use client";

import { Button } from "@/components/ui/button";
import { ApplicationState } from "@/components/ui/states";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ApplicationState
      kind="error"
      title="The workspace could not be loaded"
      description="Your data has not been changed. Try loading this page again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
