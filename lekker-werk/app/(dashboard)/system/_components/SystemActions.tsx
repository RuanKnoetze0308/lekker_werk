"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

async function act(companyId: string | null) {
  const { redirect } = await api<{ redirect: string }>("/api/system/act", { body: { companyId } });
  // Full reload: every server component must re-resolve the session against the new tenant.
  window.location.assign(redirect);
}

/** "Open as tenant": the whole app reloads showing this tenant's data. */
export function EnterTenantButton({ companyId, size = "sm" }: { companyId: string; size?: "sm" | "md" }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      size={size}
      icon={<LogIn className="size-4" />}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await act(companyId);
        } catch (err) {
          alert(err instanceof ApiError ? err.message : "Could not open this tenant.");
          setPending(false);
        }
      }}
    >
      {pending ? "Opening…" : "Open as tenant"}
    </Button>
  );
}

export function ExitTenantButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await act(null);
        } catch {
          setPending(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1 text-[13px] font-semibold hover:bg-white/25 disabled:opacity-60"
    >
      <LogOut className="size-3.5" aria-hidden /> Exit to System portal
    </button>
  );
}

export function TenantDeviceToggle({ companyId, deviceId, enabled, name }: { companyId: string; deviceId: string; enabled: boolean; name: string }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, setPending] = useState(false);
  return (
    <Toggle
      checked={on}
      disabled={pending}
      label={`${name} enabled`}
      onChange={async (v) => {
        setPending(true);
        setOn(v);
        try {
          await api(`/api/system/tenants/${companyId}/devices/${deviceId}`, { body: { enabled: v } });
          router.refresh();
        } catch (err) {
          setOn(!v);
          alert(err instanceof ApiError ? err.message : "Could not update the device.");
        } finally {
          setPending(false);
        }
      }}
    />
  );
}
