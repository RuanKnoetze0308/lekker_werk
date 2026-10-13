"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api-client";

export function EmployeeActions({ employeeId, active }: { employeeId: string; active: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    const verb = active ? "deactivate" : "reactivate";
    if (!confirm(`Are you sure you want to ${verb} this employee?${active ? " Their history is kept, but they can no longer clock." : ""}`)) return;
    setPending(true);
    try {
      await api(`/api/employees/${employeeId}/status`, { body: { active: !active } });
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not update the employee.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant={active ? "danger" : "primary"} onClick={toggle} disabled={pending}>
      {active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
