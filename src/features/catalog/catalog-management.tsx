"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Building2,
  Database,
  Layers3,
  Pencil,
  Plus,
  Ruler,
  Search,
  Truck,
  X,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-controls";
import { ApplicationState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CatalogStatusToggle,
  CategoryForm,
  ClientForm,
  MaterialForm,
  SupplierForm,
  UnitForm,
} from "@/features/catalog/catalog-forms";
import type { CatalogWorkspace } from "@/features/catalog/catalog-queries";

type ClientRecord = CatalogWorkspace["clients"][number];
type CategoryRecord = CatalogWorkspace["categories"][number];
type UnitRecord = CatalogWorkspace["units"][number];
type MaterialRecord = CatalogWorkspace["materials"][number];
type SupplierRecord = CatalogWorkspace["suppliers"][number];

type CatalogPermissions = {
  canViewCatalog: boolean;
  canManageCatalog: boolean;
  canViewSuppliers: boolean;
  canManageSuppliers: boolean;
};

function EditorDialog({
  title,
  description,
  create = false,
  children,
}: {
  title: string;
  description: string;
  create?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={create ? "primary" : "tertiary"} size="sm">
          {create ? <Plus className="size-4" /> : <Pencil className="size-4" />}
          {create ? "Add new" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={title}
        description={description}
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  count,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
          <Icon className="size-5" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold text-slate-950">
              {title}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              {count}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function RecordCard({
  code,
  title,
  active,
  children,
  actions,
  href,
}: {
  code: string;
  title: string;
  active: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  href?: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="pointer-events-none text-xs font-bold uppercase tracking-wider text-slate-400">
            {code}
          </p>
          {href ? (
            <Link
              href={href}
              className="relative z-10 -mx-1 mt-0.5 block scroll-my-24 truncate rounded px-1 py-0.5 font-semibold text-slate-950 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {title}
            </Link>
          ) : (
            <h3 className="mt-1 truncate font-semibold text-slate-950">
              {title}
            </h3>
          )}
        </div>
        <StatusBadge status={active ? "Active" : "Disabled"} />
      </div>
      <div className="mt-4 space-y-2 text-sm text-slate-600">{children}</div>
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
          {actions}
        </div>
      ) : null}
    </article>
  );
}

function NoMatches({ noun }: { noun: string }) {
  return (
    <ApplicationState
      kind="empty"
      title={`No matching ${noun}`}
      description="Try a different search term or clear the current filter."
      className="min-h-48"
    />
  );
}

function locationLine(
  city: string | null,
  state: string | null,
  postalCode: string | null,
) {
  return [city, state, postalCode].filter(Boolean).join(", ") || "Not provided";
}

function ClientActions({
  client,
  canManage,
}: {
  client: ClientRecord;
  canManage: boolean;
}) {
  if (!canManage) return null;
  return (
    <>
      <EditorDialog
        title={`Edit ${client.name}`}
        description="Update client identity and contact information. Project relationships are preserved."
      >
        <ClientForm client={client} />
      </EditorDialog>
      <CatalogStatusToggle
        kind="client"
        id={client.id}
        active={client.isActive}
        label={client.name}
      />
    </>
  );
}

function CategoryActions({
  category,
  canManage,
}: {
  category: CategoryRecord;
  canManage: boolean;
}) {
  if (!canManage) return null;
  return (
    <>
      <EditorDialog
        title={`Edit ${category.name}`}
        description="Maintain the controlled grouping used by the material master."
      >
        <CategoryForm category={category} />
      </EditorDialog>
      <CatalogStatusToggle
        kind="category"
        id={category.id}
        active={category.isActive}
        label={category.name}
      />
    </>
  );
}

function UnitActions({
  unit,
  canManage,
}: {
  unit: UnitRecord;
  canManage: boolean;
}) {
  if (!canManage) return null;
  return (
    <>
      <EditorDialog
        title={`Edit ${unit.name}`}
        description="Update the controlled unit name, symbol, and quantity precision."
      >
        <UnitForm unit={unit} />
      </EditorDialog>
      <CatalogStatusToggle
        kind="unit"
        id={unit.id}
        active={unit.isActive}
        label={unit.name}
      />
    </>
  );
}

function MaterialActions({
  material,
  categories,
  units,
  canManage,
}: {
  material: MaterialRecord;
  categories: CategoryRecord[];
  units: UnitRecord[];
  canManage: boolean;
}) {
  if (!canManage) return null;
  return (
    <>
      <EditorDialog
        title={`Edit ${material.name}`}
        description="Update the reusable material definition and its planning thresholds."
      >
        <MaterialForm
          material={material}
          categories={categories}
          units={units}
        />
      </EditorDialog>
      <CatalogStatusToggle
        kind="material"
        id={material.id}
        active={material.isActive}
        label={material.name}
      />
    </>
  );
}

function SupplierActions({
  supplier,
  canManage,
}: {
  supplier: SupplierRecord;
  canManage: boolean;
}) {
  if (!canManage) return null;
  return (
    <>
      <EditorDialog
        title={`Edit ${supplier.legalName}`}
        description="Update the supplier profile, GST registration, and primary contact."
      >
        <SupplierForm supplier={supplier} />
      </EditorDialog>
      <CatalogStatusToggle
        kind="supplier"
        id={supplier.id}
        active={supplier.isActive}
        label={supplier.legalName}
      />
    </>
  );
}

function ClientsSection({
  clients,
  canManage,
}: {
  clients: ClientRecord[];
  canManage: boolean;
}) {
  return (
    <Card id="clients" className="scroll-mt-28">
      <CardHeader>
        <SectionHeading
          icon={Building2}
          title="Clients"
          description="Relational client records used by projects and portfolio reporting."
          count={clients.length}
          action={
            canManage ? (
              <EditorDialog
                create
                title="Create client"
                description="Add a client before linking it to a project."
              >
                <ClientForm />
              </EditorDialog>
            ) : undefined
          }
        />
      </CardHeader>
      <CardContent>
        {clients.length ? (
          <>
            <TableContainer className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Projects</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <tbody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <p className="font-semibold text-slate-950">
                          {client.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {client.clientCode}
                        </p>
                      </TableCell>
                      <TableCell>
                        {locationLine(
                          client.city,
                          client.state,
                          client.postalCode,
                        )}
                      </TableCell>
                      <TableCell>
                        <p>{client.email ?? "No email"}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {client.phone ?? "No phone"}
                        </p>
                      </TableCell>
                      <TableCell>{client._count.projects}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={client.isActive ? "Active" : "Disabled"}
                        />
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <ClientActions client={client} canManage />
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
            <div className="grid gap-3 lg:hidden">
              {clients.map((client) => (
                <RecordCard
                  key={client.id}
                  code={client.clientCode}
                  title={client.name}
                  active={client.isActive}
                  actions={
                    canManage ? (
                      <ClientActions client={client} canManage={canManage} />
                    ) : undefined
                  }
                >
                  <p>
                    {locationLine(client.city, client.state, client.postalCode)}
                  </p>
                  <p>{client._count.projects} linked projects</p>
                  <p>{client.email ?? client.phone ?? "No contact provided"}</p>
                </RecordCard>
              ))}
            </div>
          </>
        ) : (
          <NoMatches noun="clients" />
        )}
      </CardContent>
    </Card>
  );
}

function MaterialsSection({
  materials,
  categories,
  units,
  canManage,
}: {
  materials: MaterialRecord[];
  categories: CategoryRecord[];
  units: UnitRecord[];
  canManage: boolean;
}) {
  const canCreate =
    canManage &&
    categories.some((category) => category.isActive) &&
    units.some((unit) => unit.isActive);
  return (
    <Card id="materials" className="scroll-mt-28">
      <CardHeader>
        <SectionHeading
          icon={Boxes}
          title="Materials"
          description="Controlled material definitions, default units, and stock-planning levels."
          count={materials.length}
          action={
            canCreate ? (
              <EditorDialog
                create
                title="Create material"
                description="Add a reusable material for future requirements and purchasing."
              >
                <MaterialForm categories={categories} units={units} />
              </EditorDialog>
            ) : undefined
          }
        />
        {canManage && !canCreate ? (
          <div className="mt-4">
            <Alert>
              Create at least one active category and unit before adding a
              material.
            </Alert>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {materials.length ? (
          <>
            <TableContainer className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Default unit</TableHead>
                    <TableHead>Minimum / reorder</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <tbody>
                  {materials.map((material) => (
                    <TableRow key={material.id}>
                      <TableCell>
                        <p className="font-semibold text-slate-950">
                          {material.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {material.materialCode}
                        </p>
                      </TableCell>
                      <TableCell>
                        {material.category.name}
                        {!material.category.isActive ? (
                          <span className="block text-xs text-amber-700">
                            Inactive category
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {material.defaultUnit.name} (
                        {material.defaultUnit.symbol})
                      </TableCell>
                      <TableCell>
                        {material.minimumStockLevel} / {material.reorderLevel}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={material.isActive ? "Active" : "Disabled"}
                        />
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <MaterialActions
                              material={material}
                              categories={categories}
                              units={units}
                              canManage
                            />
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
            <div className="grid gap-3 lg:hidden">
              {materials.map((material) => (
                <RecordCard
                  key={material.id}
                  code={material.materialCode}
                  title={material.name}
                  active={material.isActive}
                  actions={
                    canManage ? (
                      <MaterialActions
                        material={material}
                        categories={categories}
                        units={units}
                        canManage={canManage}
                      />
                    ) : undefined
                  }
                >
                  <p>{material.category.name}</p>
                  <p>
                    Default unit: {material.defaultUnit.name} (
                    {material.defaultUnit.symbol})
                  </p>
                  <p>
                    Minimum {material.minimumStockLevel} · Reorder{" "}
                    {material.reorderLevel}
                  </p>
                </RecordCard>
              ))}
            </div>
          </>
        ) : (
          <NoMatches noun="materials" />
        )}
      </CardContent>
    </Card>
  );
}

function CategoriesSection({
  categories,
  canManage,
}: {
  categories: CategoryRecord[];
  canManage: boolean;
}) {
  return (
    <Card id="categories" className="scroll-mt-28">
      <CardHeader>
        <SectionHeading
          icon={Layers3}
          title="Material categories"
          description="Flat controlled groupings for the Phase 2 material master."
          count={categories.length}
          action={
            canManage ? (
              <EditorDialog
                create
                title="Create material category"
                description="Add a controlled category for classifying materials."
              >
                <CategoryForm />
              </EditorDialog>
            ) : undefined
          }
        />
      </CardHeader>
      <CardContent>
        {categories.length ? (
          <>
            <TableContainer className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Materials</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <tbody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell>
                        <p className="font-semibold text-slate-950">
                          {category.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {category.code}
                        </p>
                      </TableCell>
                      <TableCell>{category._count.materials}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={category.isActive ? "Active" : "Disabled"}
                        />
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <CategoryActions category={category} canManage />
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
            <div className="grid gap-3 lg:hidden">
              {categories.map((category) => (
                <RecordCard
                  key={category.id}
                  code={category.code}
                  title={category.name}
                  active={category.isActive}
                  actions={
                    canManage ? (
                      <CategoryActions
                        category={category}
                        canManage={canManage}
                      />
                    ) : undefined
                  }
                >
                  <p>{category._count.materials} linked materials</p>
                  <p>{category.description ?? "No description"}</p>
                </RecordCard>
              ))}
            </div>
          </>
        ) : (
          <NoMatches noun="categories" />
        )}
      </CardContent>
    </Card>
  );
}

function UnitsSection({
  units,
  canManage,
}: {
  units: UnitRecord[];
  canManage: boolean;
}) {
  return (
    <Card id="units" className="scroll-mt-28">
      <CardHeader>
        <SectionHeading
          icon={Ruler}
          title="Units of measure"
          description="Controlled quantity units and allowed decimal precision."
          count={units.length}
          action={
            canManage ? (
              <EditorDialog
                create
                title="Create unit of measure"
                description="Add a controlled unit for use by materials."
              >
                <UnitForm />
              </EditorDialog>
            ) : undefined
          }
        />
      </CardHeader>
      <CardContent>
        {units.length ? (
          <>
            <TableContainer className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Precision</TableHead>
                    <TableHead>Materials</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <tbody>
                  {units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell>
                        <p className="font-semibold text-slate-950">
                          {unit.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {unit.code}
                        </p>
                      </TableCell>
                      <TableCell>{unit.symbol}</TableCell>
                      <TableCell>{unit.decimalScale} decimals</TableCell>
                      <TableCell>{unit._count.materials}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={unit.isActive ? "Active" : "Disabled"}
                        />
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <UnitActions unit={unit} canManage />
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
            <div className="grid gap-3 lg:hidden">
              {units.map((unit) => (
                <RecordCard
                  key={unit.id}
                  code={unit.code}
                  title={`${unit.name} (${unit.symbol})`}
                  active={unit.isActive}
                  actions={
                    canManage ? (
                      <UnitActions unit={unit} canManage={canManage} />
                    ) : undefined
                  }
                >
                  <p>{unit.decimalScale} decimal places</p>
                  <p>{unit._count.materials} linked materials</p>
                  <p>{unit.description ?? "No description"}</p>
                </RecordCard>
              ))}
            </div>
          </>
        ) : (
          <NoMatches noun="units" />
        )}
      </CardContent>
    </Card>
  );
}

function SuppliersSection({
  suppliers,
  canManage,
}: {
  suppliers: SupplierRecord[];
  canManage: boolean;
}) {
  return (
    <Card id="suppliers" className="scroll-mt-28">
      <CardHeader>
        <SectionHeading
          icon={Truck}
          title="Suppliers"
          description="Supplier identity, GST registration, addresses, and primary contacts."
          count={suppliers.length}
          action={
            canManage ? (
              <EditorDialog
                create
                title="Create supplier"
                description="Add a supplier profile for future procurement workflows."
              >
                <SupplierForm />
              </EditorDialog>
            ) : undefined
          }
        />
      </CardHeader>
      <CardContent>
        {suppliers.length ? (
          <>
            <TableContainer className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Primary contact</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <tbody>
                  {suppliers.map((supplier) => {
                    const contact = supplier.contacts.find(
                      (item) => item.isPrimary,
                    );
                    return (
                      <TableRow key={supplier.id}>
                        <TableCell>
                          <Link
                            href={`/master-data/suppliers/${supplier.id}`}
                            className="font-semibold text-slate-950 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            {supplier.legalName}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {supplier.supplierCode}
                            {supplier.tradeName
                              ? ` · ${supplier.tradeName}`
                              : ""}
                          </p>
                        </TableCell>
                        <TableCell>
                          {supplier.isGstRegistered
                            ? supplier.gstin
                            : "Unregistered"}
                        </TableCell>
                        <TableCell>
                          {locationLine(
                            supplier.city,
                            supplier.state,
                            supplier.postalCode,
                          )}
                        </TableCell>
                        <TableCell>
                          <p>{contact?.name ?? "Not provided"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {contact?.phone ?? contact?.email ?? "—"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={supplier.isActive ? "Active" : "Disabled"}
                          />
                        </TableCell>
                        {canManage ? (
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <SupplierActions supplier={supplier} canManage />
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </tbody>
              </Table>
            </TableContainer>
            <div className="grid gap-3 lg:hidden">
              {suppliers.map((supplier) => {
                const contact = supplier.contacts.find(
                  (item) => item.isPrimary,
                );
                return (
                  <RecordCard
                    key={supplier.id}
                    code={supplier.supplierCode}
                    title={supplier.legalName}
                    href={`/master-data/suppliers/${supplier.id}`}
                    active={supplier.isActive}
                    actions={
                      canManage ? (
                        <SupplierActions
                          supplier={supplier}
                          canManage={canManage}
                        />
                      ) : undefined
                    }
                  >
                    <p>
                      {locationLine(
                        supplier.city,
                        supplier.state,
                        supplier.postalCode,
                      )}
                    </p>
                    <p>
                      {supplier.isGstRegistered
                        ? `GSTIN ${supplier.gstin}`
                        : "Not GST registered"}
                    </p>
                    <p>
                      {contact?.name ??
                        supplier.email ??
                        supplier.phone ??
                        "No contact provided"}
                    </p>
                  </RecordCard>
                );
              })}
            </div>
          </>
        ) : (
          <NoMatches noun="suppliers" />
        )}
      </CardContent>
    </Card>
  );
}

export function CatalogManagement({
  workspace,
  permissions,
}: {
  workspace: CatalogWorkspace;
  permissions: CatalogPermissions;
}) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    const matches = (...values: Array<string | null | undefined>) =>
      !term || values.filter(Boolean).join(" ").toLowerCase().includes(term);
    return {
      clients: workspace.clients.filter((client) =>
        matches(
          client.clientCode,
          client.name,
          client.city,
          client.state,
          client.email,
          client.phone,
        ),
      ),
      categories: workspace.categories.filter((category) =>
        matches(category.code, category.name, category.description),
      ),
      units: workspace.units.filter((unit) =>
        matches(unit.code, unit.name, unit.symbol, unit.description),
      ),
      materials: workspace.materials.filter((material) =>
        matches(
          material.materialCode,
          material.name,
          material.description,
          material.category.name,
          material.defaultUnit.name,
          material.defaultUnit.symbol,
        ),
      ),
      suppliers: workspace.suppliers.filter((supplier) =>
        matches(
          supplier.supplierCode,
          supplier.legalName,
          supplier.tradeName,
          supplier.gstin,
          supplier.city,
          supplier.state,
          supplier.email,
          supplier.phone,
          ...supplier.contacts.flatMap((contact) => [
            contact.name,
            contact.email,
            contact.phone,
          ]),
        ),
      ),
    };
  }, [term, workspace]);

  const visibleSections = [
    permissions.canViewCatalog && { href: "#clients", label: "Clients" },
    permissions.canViewCatalog && { href: "#materials", label: "Materials" },
    permissions.canViewCatalog && { href: "#categories", label: "Categories" },
    permissions.canViewCatalog && { href: "#units", label: "Units" },
    permissions.canViewSuppliers && { href: "#suppliers", label: "Suppliers" },
  ].filter((item): item is { href: string; label: string } => Boolean(item));

  const metrics: Array<{
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [];
  if (permissions.canViewCatalog) {
    metrics.push({
      label: "Clients",
      value: workspace.clients.length,
      icon: Building2,
    });
    metrics.push({
      label: "Materials",
      value: workspace.materials.length,
      icon: Boxes,
    });
    metrics.push({
      label: "Categories & units",
      value: workspace.categories.length + workspace.units.length,
      icon: Database,
    });
  }
  if (permissions.canViewSuppliers) {
    metrics.push({
      label: "Suppliers",
      value: workspace.suppliers.length,
      icon: Truck,
    });
  }

  const hasReadOnlyCatalog =
    (permissions.canViewCatalog && !permissions.canManageCatalog) ||
    (permissions.canViewSuppliers && !permissions.canManageSuppliers);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent>
              <Icon className="size-5 text-blue-700" />
              <p className="mt-4 text-sm text-slate-500">{label}</p>
              <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4">
          <label className="relative block">
            <span className="sr-only">Search master data</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search codes, names, locations, contacts, GSTIN..."
              className="pl-10 pr-10"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear master data search"
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </label>
          <nav
            aria-label="Master data sections"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {visibleSections.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="min-h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </CardContent>
      </Card>

      {hasReadOnlyCatalog ? (
        <Alert>
          Some sections are read-only for your current permissions. Create,
          edit, and status controls appear only where management access is
          granted.
        </Alert>
      ) : null}

      {permissions.canViewCatalog ? (
        <ClientsSection
          clients={filtered.clients}
          canManage={permissions.canManageCatalog}
        />
      ) : null}
      {permissions.canViewCatalog ? (
        <MaterialsSection
          materials={filtered.materials}
          categories={workspace.categories}
          units={workspace.units}
          canManage={permissions.canManageCatalog}
        />
      ) : null}
      {permissions.canViewCatalog ? (
        <CategoriesSection
          categories={filtered.categories}
          canManage={permissions.canManageCatalog}
        />
      ) : null}
      {permissions.canViewCatalog ? (
        <UnitsSection
          units={filtered.units}
          canManage={permissions.canManageCatalog}
        />
      ) : null}
      {permissions.canViewSuppliers ? (
        <SuppliersSection
          suppliers={filtered.suppliers}
          canManage={permissions.canManageSuppliers}
        />
      ) : null}
    </div>
  );
}
