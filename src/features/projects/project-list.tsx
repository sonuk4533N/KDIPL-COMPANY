"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Search, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { StatusBadge, type StandardStatus } from "@/components/ui/status-badge";
import type { ProjectWorkspace } from "@/features/projects/project-queries";
import { cn } from "@/lib/cn";

function statusLabel(status: string): StandardStatus {
  return {
    PLANNING: "Planning",
    ACTIVE: "Active",
    ON_HOLD: "On hold",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  }[status] as StandardStatus;
}

export function ProjectList({
  projects,
}: {
  projects: ProjectWorkspace["projects"];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesStatus = status === "ALL" || project.status === status;
      const haystack =
        `${project.projectCode} ${project.name} ${project.client.name} ${project.location}`.toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [projects, search, status]);
  const filters = [
    "ALL",
    "ACTIVE",
    "PLANNING",
    "ON_HOLD",
    "COMPLETED",
    "CANCELLED",
  ];
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4">
          <label className="relative block">
            <span className="sr-only">Search projects</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects, clients, locations..."
              className="pl-10"
            />
          </label>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            aria-label="Filter projects by status"
          >
            {filters.map((filter) => {
              const count =
                filter === "ALL"
                  ? projects.length
                  : projects.filter((project) => project.status === filter)
                      .length;
              return (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={status === filter}
                  onClick={() => setStatus(filter)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
                    status === filter
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-300",
                  )}
                >
                  {filter === "ALL" ? "All projects" : statusLabel(filter)}{" "}
                  {count}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Project portfolio
          </h2>
          <p className="mt-1 text-sm text-slate-500" aria-live="polite">
            Showing {filtered.length} of {projects.length} projects
          </p>
        </div>
        {search || status !== "ALL" ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatus("ALL");
            }}
            className="text-sm font-semibold text-blue-700 hover:text-blue-900"
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {filtered.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => {
            const manager =
              project.assignments.find(
                (assignment) =>
                  assignment.isActive &&
                  assignment.role === "PROJECT_MANAGER" &&
                  assignment.isPrimary,
              ) ??
              project.assignments.find(
                (assignment) =>
                  assignment.isActive && assignment.role === "PROJECT_MANAGER",
              );
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {project.projectCode}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-slate-950 group-hover:text-blue-800">
                      {project.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {project.client.name}
                    </p>
                  </div>
                  <StatusBadge status={statusLabel(project.status)} />
                </div>
                <div className="mt-5 space-y-3 text-sm text-slate-600">
                  <p className="flex items-center gap-2">
                    <MapPin className="size-4 text-slate-400" />
                    {project.location}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users className="size-4 text-slate-400" />
                    {manager?.employee.fullName ?? "Manager not assigned"}
                  </p>
                  <p className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-slate-400" />
                    {project.startDate ?? "Start date not set"}
                  </p>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-xs text-slate-400">Sites</p>
                    <p className="mt-1 font-display text-xl font-bold text-slate-950">
                      {project.sites.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Active team</p>
                    <p className="mt-1 font-display text-xl font-bold text-slate-950">
                      {
                        project.assignments.filter(
                          (assignment) => assignment.isActive,
                        ).length
                      }
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-semibold text-slate-900">No matching projects</p>
          <p className="mt-2 text-sm text-slate-500">
            Try a different search or clear the filters.
          </p>
        </div>
      )}
    </div>
  );
}
