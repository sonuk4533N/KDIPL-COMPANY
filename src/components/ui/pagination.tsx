import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Pagination({
  page = 1,
  totalPages = 1,
}: {
  page?: number;
  totalPages?: number;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 text-sm text-slate-600"
    >
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" /> Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
