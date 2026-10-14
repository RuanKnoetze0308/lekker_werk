"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";
import { SHOP_CATEGORY_LABEL } from "@/lib/device-labels";

interface ProductForm {
  id: string;
  name: string;
  description: string;
  category: keyof typeof SHOP_CATEGORY_LABEL;
  price: number;
  imageUrl: string;
  active: boolean;
  inStock: boolean;
  sortOrder: number;
}

/** "Add product" (no product) or the edit pencil for an existing one. */
export function ProductButton({ product }: { product?: ProductForm }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(product?.active ?? true);
  const [inStock, setInStock] = useState(product?.inStock ?? true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const body = {
      name: f.get("name"),
      description: f.get("description"),
      category: f.get("category"),
      price: f.get("price"),
      imageUrl: f.get("imageUrl"),
      sortOrder: f.get("sortOrder") || 0,
      active,
      inStock,
    };
    try {
      await api(product ? `/api/system/shop/products/${product.id}` : "/api/system/shop/products", {
        method: product ? "PATCH" : "POST",
        body,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the product.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {product ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted hover:text-ink" aria-label={`Edit ${product.name}`}>
          <Pencil className="size-4" />
        </button>
      ) : (
        <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Add product</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={product ? "Edit product" : "New product"}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Name"><Input name="name" required maxLength={120} defaultValue={product?.name} /></Field>
          <Field label="Description"><Textarea name="description" rows={3} maxLength={1000} defaultValue={product?.description} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select name="category" defaultValue={product?.category ?? "RFID"}>
                {Object.entries(SHOP_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Price (R, incl. VAT)"><Input name="price" type="number" step="0.01" min="1" required defaultValue={product?.price} /></Field>
          </div>
          <Field label="Image URL" hint="https link to a product photo (optional)"><Input name="imageUrl" type="url" maxLength={500} defaultValue={product?.imageUrl} /></Field>
          <Field label="Sort order" hint="Lower numbers show first"><Input name="sortOrder" type="number" min="0" max="9999" defaultValue={product?.sortOrder ?? 0} /></Field>
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex items-center justify-between gap-3">Visible in the shop <Toggle checked={active} onChange={setActive} label="Visible in the shop" /></label>
            <label className="flex items-center justify-between gap-3">In stock <Toggle checked={inStock} onChange={setInStock} label="In stock" /></label>
          </div>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save product"}</Button>
        </form>
      </Modal>
    </>
  );
}

export function OrderStatusForm({ id, status, trackingNote }: { id: string; status: string; trackingNote: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api(`/api/system/shop/orders/${id}`, { method: "PATCH", body: { status: f.get("status"), trackingNote: f.get("trackingNote") } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the order.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-end">
      <Field label="Status" className="sm:w-48">
        <Select name="status" defaultValue={status === "PENDING_PAYMENT" ? "PAID" : status}>
          <option value="PAID">Paid · preparing</option>
          <option value="SHIPPED">Shipped</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </Field>
      <Field label="Tracking / note to customer" className="flex-1">
        <Input name="trackingNote" maxLength={500} defaultValue={trackingNote} placeholder="e.g. Courier Guy waybill 123456" />
      </Field>
      <Button type="submit" size="sm" variant="ink" disabled={pending}>{pending ? "Saving…" : "Update"}</Button>
      <FormMessage error={error} />
    </form>
  );
}
