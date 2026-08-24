"use client";

import { useActionState, useEffect } from "react";
import { Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import { useToast } from "@/components/ui/toast";
import {
  saveCategoryAction,
  saveClientAction,
  saveMaterialAction,
  saveSupplierAction,
  saveUnitAction,
  toggleCatalogStatusAction,
  type CatalogActionState,
} from "@/features/catalog/catalog-actions";
import type { CatalogWorkspace } from "@/features/catalog/catalog-queries";

type ClientRecord = CatalogWorkspace["clients"][number];
type CategoryRecord = CatalogWorkspace["categories"][number];
type UnitRecord = CatalogWorkspace["units"][number];
type MaterialRecord = CatalogWorkspace["materials"][number];
type SupplierRecord = CatalogWorkspace["suppliers"][number];

function actionFields(state: CatalogActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

function SubmitRow({
  state,
  pending,
  editing,
  noun,
}: {
  state: CatalogActionState;
  pending: boolean;
  editing: boolean;
  noun: string;
}) {
  return (
    <>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={pending}>
          {editing ? <Save className="size-4" /> : <Plus className="size-4" />}
          {pending ? "Saving..." : editing ? `Save ${noun}` : `Create ${noun}`}
        </Button>
      </div>
      <div className="md:col-span-2">
        <FormFeedback
          state={state}
          success={editing ? `${noun} updated.` : `${noun} created.`}
        />
      </div>
    </>
  );
}

export function ClientForm({ client }: { client?: ClientRecord }) {
  const [state, action, pending] = useActionState(saveClientAction, null);
  const fields = actionFields(state);
  const suffix = client?.id ?? "new";

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {client ? (
        <input type="hidden" name="clientId" value={client.id} />
      ) : null}
      <Field
        label="Client code"
        htmlFor={`client-code-${suffix}`}
        error={fields?.clientCode?.[0]}
      >
        <Input
          id={`client-code-${suffix}`}
          name="clientCode"
          defaultValue={client?.clientCode}
          placeholder="CLIENT-001"
          required
          aria-invalid={Boolean(fields?.clientCode)}
        />
      </Field>
      <Field
        label="Client name"
        htmlFor={`client-name-${suffix}`}
        error={fields?.name?.[0]}
      >
        <Input
          id={`client-name-${suffix}`}
          name="name"
          defaultValue={client?.name}
          required
          aria-invalid={Boolean(fields?.name)}
        />
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Address"
          htmlFor={`client-address-${suffix}`}
          error={fields?.address?.[0]}
        >
          <Textarea
            id={`client-address-${suffix}`}
            name="address"
            defaultValue={client?.address ?? ""}
            aria-invalid={Boolean(fields?.address)}
          />
        </Field>
      </div>
      <Field
        label="City"
        htmlFor={`client-city-${suffix}`}
        error={fields?.city?.[0]}
      >
        <Input
          id={`client-city-${suffix}`}
          name="city"
          defaultValue={client?.city ?? ""}
          aria-invalid={Boolean(fields?.city)}
        />
      </Field>
      <Field
        label="State"
        htmlFor={`client-state-${suffix}`}
        error={fields?.state?.[0]}
      >
        <Input
          id={`client-state-${suffix}`}
          name="state"
          defaultValue={client?.state ?? ""}
          aria-invalid={Boolean(fields?.state)}
        />
      </Field>
      <Field
        label="Postal code"
        htmlFor={`client-postal-${suffix}`}
        error={fields?.postalCode?.[0]}
      >
        <Input
          id={`client-postal-${suffix}`}
          name="postalCode"
          inputMode="numeric"
          maxLength={6}
          defaultValue={client?.postalCode ?? ""}
          aria-invalid={Boolean(fields?.postalCode)}
        />
      </Field>
      <Field
        label="Phone"
        htmlFor={`client-phone-${suffix}`}
        error={fields?.phone?.[0]}
      >
        <Input
          id={`client-phone-${suffix}`}
          name="phone"
          type="tel"
          defaultValue={client?.phone ?? ""}
          aria-invalid={Boolean(fields?.phone)}
        />
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Email"
          htmlFor={`client-email-${suffix}`}
          error={fields?.email?.[0]}
        >
          <Input
            id={`client-email-${suffix}`}
            name="email"
            type="email"
            defaultValue={client?.email ?? ""}
            aria-invalid={Boolean(fields?.email)}
          />
        </Field>
      </div>
      <SubmitRow
        state={state}
        pending={pending}
        editing={Boolean(client)}
        noun="client"
      />
    </form>
  );
}

export function CategoryForm({ category }: { category?: CategoryRecord }) {
  const [state, action, pending] = useActionState(saveCategoryAction, null);
  const fields = actionFields(state);
  const suffix = category?.id ?? "new";

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {category ? (
        <input type="hidden" name="categoryId" value={category.id} />
      ) : null}
      <Field
        label="Category code"
        htmlFor={`category-code-${suffix}`}
        error={fields?.code?.[0]}
      >
        <Input
          id={`category-code-${suffix}`}
          name="code"
          defaultValue={category?.code}
          placeholder="ELECTRICAL"
          required
          aria-invalid={Boolean(fields?.code)}
        />
      </Field>
      <Field
        label="Category name"
        htmlFor={`category-name-${suffix}`}
        error={fields?.name?.[0]}
      >
        <Input
          id={`category-name-${suffix}`}
          name="name"
          defaultValue={category?.name}
          required
          aria-invalid={Boolean(fields?.name)}
        />
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Description"
          htmlFor={`category-description-${suffix}`}
          error={fields?.description?.[0]}
        >
          <Textarea
            id={`category-description-${suffix}`}
            name="description"
            defaultValue={category?.description ?? ""}
            aria-invalid={Boolean(fields?.description)}
          />
        </Field>
      </div>
      <SubmitRow
        state={state}
        pending={pending}
        editing={Boolean(category)}
        noun="category"
      />
    </form>
  );
}

export function UnitForm({ unit }: { unit?: UnitRecord }) {
  const [state, action, pending] = useActionState(saveUnitAction, null);
  const fields = actionFields(state);
  const suffix = unit?.id ?? "new";

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {unit ? <input type="hidden" name="unitId" value={unit.id} /> : null}
      <Field
        label="Unit code"
        htmlFor={`unit-code-${suffix}`}
        error={fields?.code?.[0]}
      >
        <Input
          id={`unit-code-${suffix}`}
          name="code"
          defaultValue={unit?.code}
          placeholder="SQFT"
          required
          aria-invalid={Boolean(fields?.code)}
        />
      </Field>
      <Field
        label="Unit name"
        htmlFor={`unit-name-${suffix}`}
        error={fields?.name?.[0]}
      >
        <Input
          id={`unit-name-${suffix}`}
          name="name"
          defaultValue={unit?.name}
          placeholder="Square foot"
          required
          aria-invalid={Boolean(fields?.name)}
        />
      </Field>
      <Field
        label="Symbol"
        htmlFor={`unit-symbol-${suffix}`}
        error={fields?.symbol?.[0]}
      >
        <Input
          id={`unit-symbol-${suffix}`}
          name="symbol"
          defaultValue={unit?.symbol}
          placeholder="sq ft"
          required
          aria-invalid={Boolean(fields?.symbol)}
        />
      </Field>
      <Field
        label="Decimal precision"
        htmlFor={`unit-scale-${suffix}`}
        error={fields?.decimalScale?.[0]}
        hint="Controls how many decimal places future quantities may use."
      >
        <Select
          id={`unit-scale-${suffix}`}
          name="decimalScale"
          defaultValue={String(unit?.decimalScale ?? 3)}
          required
          aria-invalid={Boolean(fields?.decimalScale)}
        >
          {Array.from({ length: 7 }, (_, scale) => (
            <option key={scale} value={scale}>
              {scale}
            </option>
          ))}
        </Select>
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Description"
          htmlFor={`unit-description-${suffix}`}
          error={fields?.description?.[0]}
        >
          <Textarea
            id={`unit-description-${suffix}`}
            name="description"
            defaultValue={unit?.description ?? ""}
            aria-invalid={Boolean(fields?.description)}
          />
        </Field>
      </div>
      <SubmitRow
        state={state}
        pending={pending}
        editing={Boolean(unit)}
        noun="unit"
      />
    </form>
  );
}

export function MaterialForm({
  material,
  categories,
  units,
}: {
  material?: MaterialRecord;
  categories: CategoryRecord[];
  units: UnitRecord[];
}) {
  const [state, action, pending] = useActionState(saveMaterialAction, null);
  const fields = actionFields(state);
  const suffix = material?.id ?? "new";

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {material ? (
        <input type="hidden" name="materialId" value={material.id} />
      ) : null}
      <Field
        label="Material code"
        htmlFor={`material-code-${suffix}`}
        error={fields?.materialCode?.[0]}
      >
        <Input
          id={`material-code-${suffix}`}
          name="materialCode"
          defaultValue={material?.materialCode}
          placeholder="ELEC-CABLE-4SQ"
          required
          aria-invalid={Boolean(fields?.materialCode)}
        />
      </Field>
      <Field
        label="Material name"
        htmlFor={`material-name-${suffix}`}
        error={fields?.name?.[0]}
      >
        <Input
          id={`material-name-${suffix}`}
          name="name"
          defaultValue={material?.name}
          required
          aria-invalid={Boolean(fields?.name)}
        />
      </Field>
      <Field
        label="Category"
        htmlFor={`material-category-${suffix}`}
        error={fields?.categoryId?.[0]}
      >
        <Select
          id={`material-category-${suffix}`}
          name="categoryId"
          defaultValue={material?.categoryId ?? ""}
          required
          aria-invalid={Boolean(fields?.categoryId)}
        >
          <option value="">Select category</option>
          {categories
            .filter(
              (category) =>
                category.isActive || category.id === material?.categoryId,
            )
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.isActive ? "" : " (inactive)"}
              </option>
            ))}
        </Select>
      </Field>
      <Field
        label="Default unit"
        htmlFor={`material-unit-${suffix}`}
        error={fields?.defaultUnitId?.[0]}
      >
        <Select
          id={`material-unit-${suffix}`}
          name="defaultUnitId"
          defaultValue={material?.defaultUnitId ?? ""}
          required
          aria-invalid={Boolean(fields?.defaultUnitId)}
        >
          <option value="">Select unit</option>
          {units
            .filter(
              (unit) => unit.isActive || unit.id === material?.defaultUnitId,
            )
            .map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol}){unit.isActive ? "" : " — inactive"}
              </option>
            ))}
        </Select>
      </Field>
      <Field
        label="Minimum stock level"
        htmlFor={`material-minimum-${suffix}`}
        error={fields?.minimumStockLevel?.[0]}
      >
        <Input
          id={`material-minimum-${suffix}`}
          name="minimumStockLevel"
          type="number"
          min="0"
          step="0.001"
          defaultValue={material?.minimumStockLevel ?? "0"}
          required
          aria-invalid={Boolean(fields?.minimumStockLevel)}
        />
      </Field>
      <Field
        label="Reorder level"
        htmlFor={`material-reorder-${suffix}`}
        error={fields?.reorderLevel?.[0]}
        hint="Must be equal to or above minimum stock."
      >
        <Input
          id={`material-reorder-${suffix}`}
          name="reorderLevel"
          type="number"
          min="0"
          step="0.001"
          defaultValue={material?.reorderLevel ?? "0"}
          required
          aria-invalid={Boolean(fields?.reorderLevel)}
        />
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Description"
          htmlFor={`material-description-${suffix}`}
          error={fields?.description?.[0]}
        >
          <Textarea
            id={`material-description-${suffix}`}
            name="description"
            defaultValue={material?.description ?? ""}
            aria-invalid={Boolean(fields?.description)}
          />
        </Field>
      </div>
      <SubmitRow
        state={state}
        pending={pending}
        editing={Boolean(material)}
        noun="material"
      />
    </form>
  );
}

export function SupplierForm({ supplier }: { supplier?: SupplierRecord }) {
  const [state, action, pending] = useActionState(saveSupplierAction, null);
  const fields = actionFields(state);
  const suffix = supplier?.id ?? "new";
  const primaryContact = supplier?.contacts.find(
    (contact) => contact.isPrimary,
  );

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {supplier ? (
        <input type="hidden" name="supplierId" value={supplier.id} />
      ) : null}
      <Field
        label="Supplier code"
        htmlFor={`supplier-code-${suffix}`}
        error={fields?.supplierCode?.[0]}
      >
        <Input
          id={`supplier-code-${suffix}`}
          name="supplierCode"
          defaultValue={supplier?.supplierCode}
          placeholder="SUP-001"
          required
          aria-invalid={Boolean(fields?.supplierCode)}
        />
      </Field>
      <Field
        label="Legal name"
        htmlFor={`supplier-legal-${suffix}`}
        error={fields?.legalName?.[0]}
      >
        <Input
          id={`supplier-legal-${suffix}`}
          name="legalName"
          defaultValue={supplier?.legalName}
          required
          aria-invalid={Boolean(fields?.legalName)}
        />
      </Field>
      <Field
        label="Trade name"
        htmlFor={`supplier-trade-${suffix}`}
        error={fields?.tradeName?.[0]}
      >
        <Input
          id={`supplier-trade-${suffix}`}
          name="tradeName"
          defaultValue={supplier?.tradeName ?? ""}
          aria-invalid={Boolean(fields?.tradeName)}
        />
      </Field>
      <Field
        label="GSTIN"
        htmlFor={`supplier-gstin-${suffix}`}
        error={fields?.gstin?.[0]}
        hint="Required only when the supplier is GST registered."
      >
        <Input
          id={`supplier-gstin-${suffix}`}
          name="gstin"
          defaultValue={supplier?.gstin ?? ""}
          maxLength={15}
          className="uppercase"
          aria-invalid={Boolean(fields?.gstin)}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 md:col-span-2">
        <input
          type="checkbox"
          name="isGstRegistered"
          defaultChecked={supplier?.isGstRegistered ?? false}
          className="size-4 rounded border-slate-300"
        />
        GST-registered supplier
      </label>
      <div className="md:col-span-2">
        <Field
          label="Address"
          htmlFor={`supplier-address-${suffix}`}
          error={fields?.address?.[0]}
        >
          <Textarea
            id={`supplier-address-${suffix}`}
            name="address"
            defaultValue={supplier?.address ?? ""}
            aria-invalid={Boolean(fields?.address)}
          />
        </Field>
      </div>
      <Field
        label="City"
        htmlFor={`supplier-city-${suffix}`}
        error={fields?.city?.[0]}
      >
        <Input
          id={`supplier-city-${suffix}`}
          name="city"
          defaultValue={supplier?.city}
          required
          aria-invalid={Boolean(fields?.city)}
        />
      </Field>
      <Field
        label="State"
        htmlFor={`supplier-state-${suffix}`}
        error={fields?.state?.[0]}
      >
        <Input
          id={`supplier-state-${suffix}`}
          name="state"
          defaultValue={supplier?.state}
          required
          aria-invalid={Boolean(fields?.state)}
        />
      </Field>
      <Field
        label="Postal code"
        htmlFor={`supplier-postal-${suffix}`}
        error={fields?.postalCode?.[0]}
      >
        <Input
          id={`supplier-postal-${suffix}`}
          name="postalCode"
          inputMode="numeric"
          maxLength={6}
          defaultValue={supplier?.postalCode ?? ""}
          aria-invalid={Boolean(fields?.postalCode)}
        />
      </Field>
      <Field
        label="Phone"
        htmlFor={`supplier-phone-${suffix}`}
        error={fields?.phone?.[0]}
      >
        <Input
          id={`supplier-phone-${suffix}`}
          name="phone"
          type="tel"
          defaultValue={supplier?.phone ?? ""}
          aria-invalid={Boolean(fields?.phone)}
        />
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Email"
          htmlFor={`supplier-email-${suffix}`}
          error={fields?.email?.[0]}
        >
          <Input
            id={`supplier-email-${suffix}`}
            name="email"
            type="email"
            defaultValue={supplier?.email ?? ""}
            aria-invalid={Boolean(fields?.email)}
          />
        </Field>
      </div>
      <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 md:col-span-2 md:grid-cols-2">
        <legend className="px-2 text-sm font-bold text-slate-900">
          Primary contact
        </legend>
        <Field
          label="Contact name"
          htmlFor={`supplier-contact-name-${suffix}`}
          error={fields?.contactName?.[0]}
        >
          <Input
            id={`supplier-contact-name-${suffix}`}
            name="contactName"
            defaultValue={primaryContact?.name ?? ""}
            aria-invalid={Boolean(fields?.contactName)}
          />
        </Field>
        <Field
          label="Designation"
          htmlFor={`supplier-contact-role-${suffix}`}
          error={fields?.contactDesignation?.[0]}
        >
          <Input
            id={`supplier-contact-role-${suffix}`}
            name="contactDesignation"
            defaultValue={primaryContact?.designation ?? ""}
            aria-invalid={Boolean(fields?.contactDesignation)}
          />
        </Field>
        <Field
          label="Contact phone"
          htmlFor={`supplier-contact-phone-${suffix}`}
          error={fields?.contactPhone?.[0]}
        >
          <Input
            id={`supplier-contact-phone-${suffix}`}
            name="contactPhone"
            type="tel"
            defaultValue={primaryContact?.phone ?? ""}
            aria-invalid={Boolean(fields?.contactPhone)}
          />
        </Field>
        <Field
          label="Contact email"
          htmlFor={`supplier-contact-email-${suffix}`}
          error={fields?.contactEmail?.[0]}
        >
          <Input
            id={`supplier-contact-email-${suffix}`}
            name="contactEmail"
            type="email"
            defaultValue={primaryContact?.email ?? ""}
            aria-invalid={Boolean(fields?.contactEmail)}
          />
        </Field>
      </fieldset>
      <SubmitRow
        state={state}
        pending={pending}
        editing={Boolean(supplier)}
        noun="supplier"
      />
    </form>
  );
}

export function CatalogStatusToggle({
  kind,
  id,
  active,
  label,
}: {
  kind: "client" | "category" | "unit" | "material" | "supplier";
  id: string;
  active: boolean;
  label: string;
}) {
  const [state, action, pending] = useActionState(
    toggleCatalogStatusAction,
    null,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      showToast(
        `${label} ${state.data.isActive ? "reactivated" : "deactivated"}.`,
      );
      return;
    }
    showToast(state.error.message, "error");
  }, [label, showToast, state]);

  return (
    <form action={action}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="tertiary" disabled={pending}>
        {pending ? "Saving..." : active ? "Deactivate" : "Reactivate"}
      </Button>
    </form>
  );
}
