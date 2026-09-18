import Link from "next/link";
import { Search } from "lucide-react";

import { db } from "@/db/prisma";
import { globalSearch } from "@/features/reporting/global-search";
import { getReportingScope } from "@/features/reporting/reporting-scope";
import { requireCurrentPrincipal } from "@/server/auth/current-user";

type SearchParams = {
  q?: string;
  type?: string;
  projectId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: string;
};

const types = [
  "all",
  "project",
  "site",
  "client",
  "material",
  "supplier",
  "employee",
  "requirement",
  "rfq",
  "quotation",
  "po",
  "amendment",
  "grn",
  "stock",
  "movement",
  "invoice",
  "payment",
  "note",
  "tally",
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const principal = await requireCurrentPrincipal();
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 160) ?? "";
  const scope = await getReportingScope(principal);
  const [search, projects, recent] = await Promise.all([
    globalSearch(principal, {
      query,
      type: params.type,
      projectId: params.projectId,
      status: params.status,
      from: params.from,
      to: params.to,
      page: Number(params.page) || 1,
    }),
    db.project.findMany({
      where: scope.projectIds ? { id: { in: scope.projectIds } } : {},
      orderBy: { projectCode: "asc" },
      select: { id: true, projectCode: true, name: true },
    }),
    db.recentSearch.findMany({
      where: { userId: principal.userId },
      orderBy: { searchedAt: "desc" },
      distinct: ["query"],
      take: 6,
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(search.total / search.pageSize));
  const retainedEntries = Object.entries(params).filter(
    ([key, value]) => key !== "page" && Boolean(value),
  ) as Array<[string, string]>;
  const retained = new URLSearchParams(retainedEntries);
  return (
    <main className="space-y-5">
      <div>
        <p className="text-sm font-medium text-blue-700">
          Permission-scoped · Phase 8
        </p>
        <h1 className="text-2xl font-semibold">Global search</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only records inside your live permissions and assignments are searched
          or counted.
        </p>
      </div>
      <form
        action="/search"
        className="grid gap-3 rounded-xl border bg-white p-4 lg:grid-cols-[2fr_1fr_1.5fr_1fr_auto]"
      >
        <label className="relative">
          <Search className="absolute left-3 top-3 size-4 text-slate-400" />
          <input
            autoFocus
            name="q"
            defaultValue={query}
            placeholder="Number, name, GSTIN, UTR, vehicle or challan"
            className="w-full rounded-lg border py-2 pl-9 pr-3"
          />
        </label>
        <select
          name="type"
          defaultValue={params.type ?? "all"}
          className="rounded-lg border p-2"
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {type === "all"
                ? "All authorized types"
                : type.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          name="projectId"
          defaultValue={params.projectId ?? ""}
          className="rounded-lg border p-2"
        >
          <option value="">All authorized projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.projectCode} · {project.name}
            </option>
          ))}
        </select>
        <input
          name="status"
          defaultValue={params.status}
          placeholder="Status"
          className="rounded-lg border p-2"
        />
        <button className="rounded-lg bg-slate-900 px-5 py-2 font-semibold text-white">
          Search
        </button>
        <input
          type="date"
          name="from"
          defaultValue={params.from}
          aria-label="From date"
          className="rounded-lg border p-2"
        />
        <input
          type="date"
          name="to"
          defaultValue={params.to}
          aria-label="To date"
          className="rounded-lg border p-2"
        />
      </form>
      {!query && recent.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Recent searches</h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((item) => (
              <Link
                key={item.id}
                href={`/search?q=${encodeURIComponent(item.query)}`}
                className="rounded-full border bg-white px-3 py-1 text-sm"
              >
                {item.query}
              </Link>
            ))}
          </div>
        </div>
      )}
      {query.length === 1 && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          Enter at least two characters.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {search.results.map((result) => (
          <Link
            key={`${result.type}-${result.href}-${result.label}`}
            href={result.href}
            className="rounded-xl border bg-white p-4 outline-none hover:border-blue-300 focus:ring-2 focus:ring-blue-500"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  {result.type}
                </p>
                <p className="mt-1 font-semibold text-slate-950">
                  {result.label}
                </p>
                <p className="mt-1 text-sm text-slate-500">{result.detail}</p>
              </div>
              {result.status && (
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold">
                  {result.status.replaceAll("_", " ")}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
      {query.length >= 2 && search.total === 0 && (
        <p className="rounded-xl border bg-white p-6 text-sm text-slate-600">
          No authorized results match this search.
        </p>
      )}
      {search.total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span>
            {search.total} authorized results · page {search.page} of{" "}
            {pageCount}
          </span>
          <div className="flex gap-2">
            {search.page > 1 && (
              <Link
                className="rounded border px-3 py-1"
                href={`?${retained}&page=${search.page - 1}`}
              >
                Previous
              </Link>
            )}
            {search.page < pageCount && (
              <Link
                className="rounded border px-3 py-1"
                href={`?${retained}&page=${search.page + 1}`}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
