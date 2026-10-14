"use client";

import { useMemo, useState } from "react";
import { Minus, Package, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";
import { SHOP_CATEGORY_LABEL, formatRand } from "@/lib/device-labels";

export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  category: keyof typeof SHOP_CATEGORY_LABEL;
  priceCents: number;
  imageUrl: string | null;
  inStock: boolean;
}

interface Checkout {
  action: string;
  fields: [string, string][];
}

/** PayFast needs a normal browser form POST with the signed fields. */
function postToPayfast(co: Checkout) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = co.action;
  for (const [name, value] of co.fields) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export function HardwareShop({ products, defaultName }: { products: ShopProduct[]; defaultName: string }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(
    () => products.filter((p) => cart[p.id]).map((p) => ({ ...p, quantity: cart[p.id] })),
    [products, cart],
  );
  const total = lines.reduce((n, l) => n + l.priceCents * l.quantity, 0);
  const count = lines.reduce((n, l) => n + l.quantity, 0);

  const setQty = (id: string, q: number) =>
    setCart((c) => {
      const next = { ...c };
      if (q <= 0) delete next[id];
      else next[id] = Math.min(500, q);
      return next;
    });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const co = await api<Checkout>("/api/shop/orders", {
        body: {
          items: lines.map((l) => ({ productId: l.id, quantity: l.quantity })),
          deliveryName: f.get("deliveryName"),
          deliveryPhone: f.get("deliveryPhone"),
          deliveryAddress: f.get("deliveryAddress"),
          notes: f.get("notes"),
        },
      });
      postToPayfast(co);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
      setPending(false);
    }
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[20px] border border-border bg-white px-6 py-12 text-center">
        <Package className="size-8 text-muted" aria-hidden />
        <p className="font-semibold text-ink">The hardware shop is being stocked</p>
        <p className="max-w-sm text-sm text-muted">RFID bands, tablets and stands will be available here soon.</p>
      </div>
    );
  }

  const stepper = (p: ShopProduct) => {
    const q = cart[p.id] ?? 0;
    if (!p.inStock) return <span className="text-sm font-medium text-muted">Out of stock</span>;
    if (!q) return <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setQty(p.id, 1)}>Add</Button>;
    return (
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setQty(p.id, q - 1)} className="inline-flex size-9 items-center justify-center rounded-lg border border-border" aria-label={`One less ${p.name}`}><Minus className="size-4" /></button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={500}
          value={q}
          onChange={(e) => setQty(p.id, Number(e.target.value) || 0)}
          className="h-9 w-14 rounded-lg border border-border text-center text-sm"
          aria-label={`${p.name} quantity`}
        />
        <button type="button" onClick={() => setQty(p.id, q + 1)} className="inline-flex size-9 items-center justify-center rounded-lg border border-border" aria-label={`One more ${p.name}`}><Plus className="size-4" /></button>
      </div>
    );
  };

  return (
    <div className={count ? "pb-24" : ""}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <article key={p.id} className="flex flex-col overflow-hidden rounded-[20px] border border-border bg-white">
            <div className="flex aspect-[4/3] items-center justify-center bg-soft-surface">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <Package className="size-10 text-muted" aria-hidden />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{SHOP_CATEGORY_LABEL[p.category]}</p>
              <h3 className="font-semibold text-ink">{p.name}</h3>
              {p.description && <p className="text-sm text-muted">{p.description}</p>}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                <span className="text-lg font-bold text-ink">{formatRand(p.priceCents)}</span>
                {stepper(p)}
              </div>
            </div>
          </article>
        ))}
      </div>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold text-ink">{count} item{count === 1 ? "" : "s"}</span>
              <span className="text-muted"> · {formatRand(total)} incl. VAT</span>
            </p>
            <Button icon={<ShoppingCart className="size-4" />} onClick={() => setOpen(true)}>Checkout</Button>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => !pending && setOpen(false)} title="Checkout">
        <ul className="mb-4 divide-y divide-border/70 rounded-xl border border-border text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 px-3 py-2">
              <span>{l.quantity}× {l.name}</span>
              <span className="shrink-0 font-medium">{formatRand(l.priceCents * l.quantity)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 px-3 py-2 font-semibold">
            <span>Total (incl. VAT)</span>
            <span>{formatRand(total)}</span>
          </li>
        </ul>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Deliver to"><Input name="deliveryName" required maxLength={120} defaultValue={defaultName} /></Field>
          <Field label="Contact number"><Input name="deliveryPhone" type="tel" required maxLength={30} /></Field>
          <Field label="Delivery address"><Textarea name="deliveryAddress" required minLength={10} maxLength={500} rows={3} /></Field>
          <Field label="Notes (optional)" hint="e.g. which location the gear is for"><Input name="notes" maxLength={500} /></Field>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>{pending ? "Redirecting to PayFast…" : `Pay ${formatRand(total)} with PayFast`}</Button>
        </form>
      </Modal>
    </div>
  );
}
