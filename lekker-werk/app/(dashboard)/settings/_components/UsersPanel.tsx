"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

export function UserCreateButton({ locations }: { locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("MANAGER");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/api/users", {
        body: { name: f.get("name"), email: f.get("email"), password: f.get("password"), role, locationIds: role === "MANAGER" ? locationIds : [] },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the user.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Add user</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add user">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Name"><Input name="name" required /></Field>
          <Field label="Email"><Input name="email" type="email" required /></Field>
          <Field label="Temporary password" hint="10+ characters. Ask them to change it after first login."><Input name="password" type="password" minLength={10} required autoComplete="new-password" /></Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="MANAGER">Manager (assigned locations only)</option>
              <option value="COMPANY_ADMIN">Company admin (everything)</option>
            </Select>
          </Field>
          {role === "MANAGER" && (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">Manages</legend>
              <div className="flex flex-wrap gap-3">
                {locations.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={locationIds.includes(l.id)}
                      onChange={(e) => setLocationIds(e.target.checked ? [...locationIds, l.id] : locationIds.filter((x) => x !== l.id))}
                      className="size-4 accent-[var(--color-dark-green)]"
                    />
                    {l.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create user"}</Button>
        </form>
      </Modal>
    </>
  );
}

export function UserStatusButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function toggle() {
    setPending(true);
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: { active: !active } });
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not update the user.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Button size="sm" variant={active ? "danger" : "secondary-light"} onClick={toggle} disabled={pending}>
      {active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
