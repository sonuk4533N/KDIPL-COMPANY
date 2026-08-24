import { notFound } from "next/navigation";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { z } from "zod";

import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CatalogStatusToggle,
  SupplierForm,
} from "@/features/catalog/catalog-forms";
import { getSupplierDetail } from "@/features/catalog/catalog-queries";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  if (!z.string().uuid().safeParse(supplierId).success) notFound();
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "supplier.view")) notFound();
  const supplier = await getSupplierDetail(principal, supplierId);
  if (!supplier) notFound();
  const canManage = hasPermission(principal, "supplier.manage");

  return (
    <div className="space-y-7">
      <ButtonLink
        href="/master-data#suppliers"
        variant="tertiary"
        className="-ml-4"
      >
        ← Back to suppliers
      </ButtonLink>
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-blue-700 font-display text-xl font-extrabold text-white">
            {initials(supplier.legalName)}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
              Catalog / Suppliers / {supplier.supplierCode}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                {supplier.legalName}
              </h1>
              <StatusBadge status={supplier.isActive ? "Active" : "Disabled"} />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {supplier.tradeName || "Registered supplier profile"}
            </p>
          </div>
        </div>
        {canManage ? (
          <CatalogStatusToggle
            kind="supplier"
            id={supplier.id}
            active={supplier.isActive}
            label={supplier.legalName}
          />
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Building2 className="size-5 text-blue-700" />
              <h2 className="font-display text-lg font-bold text-slate-950">
                Organization profile
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <Detail label="Supplier code" value={supplier.supplierCode} />
              <Detail label="Legal name" value={supplier.legalName} />
              <Detail label="Trade name" value={supplier.tradeName} />
              <Detail
                label="GST registration"
                value={supplier.isGstRegistered ? "Registered" : "Unregistered"}
              />
              <Detail label="GSTIN" value={supplier.gstin} />
              <Detail label="Phone" value={supplier.phone} />
              <Detail label="Email" value={supplier.email} />
              <Detail label="City" value={supplier.city} />
              <Detail label="State" value={supplier.state} />
              <Detail label="Postal code" value={supplier.postalCode} />
              <div className="sm:col-span-2 xl:col-span-3">
                <Detail label="Address" value={supplier.address} />
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <UserRound className="size-5 text-blue-700" />
              <h2 className="font-display text-lg font-bold text-slate-950">
                Primary contacts
              </h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {supplier.contacts.length ? (
              supplier.contacts.map((contact) => (
                <article
                  key={contact.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">
                      {contact.name}
                    </p>
                    {contact.isPrimary ? (
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                        Primary
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {contact.designation || "Contact person"}
                  </p>
                  {contact.phone ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="size-4 text-slate-400" />
                      {contact.phone}
                    </p>
                  ) : null}
                  {contact.email ? (
                    <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                      <Mail className="size-4 text-slate-400" />
                      {contact.email}
                    </p>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                No active supplier contacts.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <ReceiptText className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">GST status</p>
            <p className="mt-1 font-semibold text-slate-950">
              {supplier.isGstRegistered ? "Registered" : "Unregistered"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <MapPin className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Operating city</p>
            <p className="mt-1 font-semibold text-slate-950">{supplier.city}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <UserRound className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Active contacts</p>
            <p className="mt-1 font-semibold text-slate-950">
              {supplier.contacts.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Edit supplier
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Maintain identity, GST registration, contact, and address
              information.
            </p>
          </CardHeader>
          <CardContent>
            <SupplierForm supplier={supplier} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
