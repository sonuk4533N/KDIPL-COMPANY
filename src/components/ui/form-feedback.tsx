import { Alert } from "@/components/ui/alert";

export function FormFeedback({
  state,
  success = "Saved successfully.",
}: {
  state: {
    ok: boolean;
    error?: { message: string };
  } | null;
  success?: string;
}) {
  if (!state) return null;
  return state.ok ? (
    <Alert variant="success">
      <span aria-live="polite">{success}</span>
    </Alert>
  ) : (
    <Alert variant="error">
      <span aria-live="assertive">{state.error?.message}</span>
    </Alert>
  );
}
