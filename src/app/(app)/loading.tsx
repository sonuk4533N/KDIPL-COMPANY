import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div aria-label="Loading workspace" role="status" className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-4 w-[34rem] max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-40" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
