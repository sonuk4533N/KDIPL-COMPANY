"use client";

import { useMemo, useState } from "react";
import { CalendarDays, MapPin, Search } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RequirementWorkspace } from "@/features/requirements/requirement-queries";

export function RequirementList({
  requirements,
}: {
  requirements: RequirementWorkspace["requirements"];
}) {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return requirements;
    return requirements.filter((requirement) =>
      `${requirement.requirementNumber} ${requirement.project.name} ${requirement.site.name} ${requirement.purpose}`
        .toLowerCase()
        .includes(term),
    );
  }, [requirements, search]);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent>
          <label className="relative block">
            <span className="sr-only">Search material requirements</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search number, project, site, or purpose..."
              className="pl-10"
            />
          </label>
        </CardContent>
      </Card>
      <div>
        <h2 className="font-display text-lg font-bold text-slate-950">
          Draft register
        </h2>
        <p className="mt-1 text-sm text-slate-500" aria-live="polite">
          Showing {visible.length} of {requirements.length} requirements
        </p>
      </div>
      {visible.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((requirement) => (
            <Link
              key={requirement.id}
              href={`/requirements/${requirement.id}`}
              className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    {requirement.requirementNumber}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-bold text-slate-950 group-hover:text-blue-800">
                    {requirement.purpose}
                  </h3>
                </div>
                <StatusBadge status="Draft" />
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>{requirement.project.name}</p>
                <p className="flex items-center gap-2">
                  <MapPin className="size-4 text-slate-400" />
                  {requirement.site.name} · {requirement.site.siteCode}
                </p>
                <p className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-slate-400" />
                  Needed by {requirement.neededBy}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span>{requirement.lines.length} material lines</span>
                <span>Created by {requirement.createdBy.displayName}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-semibold text-slate-900">No matching drafts</p>
          <p className="mt-2 text-sm text-slate-500">
            Create the first draft or try a different search.
          </p>
        </div>
      )}
    </div>
  );
}
