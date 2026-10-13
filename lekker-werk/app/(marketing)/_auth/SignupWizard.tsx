"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";
import { signupSchema, type SignupInput } from "@/lib/schemas/auth";
import { TRIAL_DAYS } from "@/lib/pricing";

type Draft = {
  companyName: string;
  registrationNumber: string;
  contactName: string;
  email: string;
  phone: string;
  password: string;
  preferredChannel: "WHATSAPP" | "TELEGRAM";
  locationMode: "ONE" | "MULTIPLE";
  locations: { name: string; address: string; latitude: string; longitude: string }[];
};

const emptyLocation = { name: "", address: "", latitude: "", longitude: "" };

const STEPS = ["Company", "Channel", "Locations"] as const;

export function SignupWizard({ onSwitch }: { onSwitch: (m: "login") => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [d, setD] = useState<Draft>({
    companyName: "",
    registrationNumber: "",
    contactName: "",
    email: "",
    phone: "",
    password: "",
    preferredChannel: "WHATSAPP",
    locationMode: "ONE",
    locations: [{ ...emptyLocation }],
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  function toPayload(): unknown {
    const locations = (d.locationMode === "ONE" ? d.locations.slice(0, 1) : d.locations).map((l) => ({
      name: l.name,
      address: l.address,
      latitude: l.latitude === "" ? null : Number(l.latitude),
      longitude: l.longitude === "" ? null : Number(l.longitude),
    }));
    return { ...d, locations };
  }

  function validateStep(): boolean {
    const result = signupSchema.safeParse(toPayload());
    const fields: Record<string, string> = {};
    if (!result.success) {
      for (const i of result.error.issues) fields[i.path.join(".")] = i.message;
    }
    const stepKeys = [
      ["companyName", "registrationNumber", "contactName", "email", "phone", "password"],
      ["preferredChannel"],
      ["locationMode", "locations"],
    ][step];
    const relevant = Object.fromEntries(
      Object.entries(fields).filter(([k]) => stepKeys.some((s) => k === s || k.startsWith(`${s}.`))),
    );
    setFieldErrors(relevant);
    return Object.keys(relevant).length === 0;
  }

  async function submit() {
    if (!validateStep()) return;
    setPending(true);
    setError(null);
    try {
      const { redirect } = await api<{ redirect: string }>("/api/auth/signup", {
        body: toPayload() as SignupInput,
      });
      router.push(redirect);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
        if (err.status === 409) setStep(0);
      } else setError("Could not create your account.");
      setPending(false);
    }
  }

  const next = () => validateStep() && setStep((s) => s + 1);

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex items-center gap-2 text-xs font-semibold">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full ${i <= step ? "bg-dark-green text-white" : "bg-soft-surface text-muted"}`}
            >
              {i + 1}
            </span>
            <span className={i === step ? "text-ink" : "text-muted"}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" error={fieldErrors.companyName} className="sm:col-span-2">
            <Input value={d.companyName} onChange={(e) => set("companyName", e.target.value)} autoComplete="organization" />
          </Field>
          <Field label="Registration number" hint="If applicable" error={fieldErrors.registrationNumber}>
            <Input value={d.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} />
          </Field>
          <Field label="Primary contact name" error={fieldErrors.contactName}>
            <Input value={d.contactName} onChange={(e) => set("contactName", e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email address" error={fieldErrors.email}>
            <Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Phone number" error={fieldErrors.phone}>
            <Input type="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />
          </Field>
          <Field label="Password" error={fieldErrors.password} hint="10+ characters with upper, lower and a number" className="sm:col-span-2">
            <Input type="password" value={d.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            How will your employees clock in? You can change this later in Settings.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["WHATSAPP", "WhatsApp", MessageCircle, "Familiar to everyone. Uses the WhatsApp Business API."],
                ["TELEGRAM", "Telegram", Send, "Simplest to set up. Uses a free Telegram bot."],
              ] as const
            ).map(([value, label, Icon, blurb]) => (
              <button
                key={value}
                type="button"
                onClick={() => set("preferredChannel", value)}
                aria-pressed={d.preferredChannel === value}
                className={`flex flex-col gap-2 rounded-[18px] border p-4 text-left transition-colors ${d.preferredChannel === value ? "border-dark-green bg-pale-green" : "border-border hover:border-ink/30"}`}
              >
                <Icon className="size-5 text-dark-green" aria-hidden />
                <span className="font-semibold text-ink">{label}</span>
                <span className="text-[13px] text-muted">{blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["ONE", "One location", "A single store or site"],
                ["MULTIPLE", "Multiple locations", "Several stores, branches or sites"],
              ] as const
            ).map(([value, label, blurb]) => (
              <button
                key={value}
                type="button"
                aria-pressed={d.locationMode === value}
                onClick={() => set("locationMode", value)}
                className={`rounded-[18px] border p-4 text-left ${d.locationMode === value ? "border-dark-green bg-pale-green" : "border-border hover:border-ink/30"}`}
              >
                <span className="block font-semibold text-ink">{label}</span>
                <span className="text-[13px] text-muted">{blurb}</span>
              </button>
            ))}
          </div>

          {(d.locationMode === "ONE" ? d.locations.slice(0, 1) : d.locations).map((loc, i) => (
            <fieldset key={i} className="grid gap-3 rounded-[16px] border border-border p-4 sm:grid-cols-2">
              <legend className="px-1 text-xs font-semibold text-muted">
                {d.locationMode === "ONE" ? "Your location" : `Location ${i + 1}`}
              </legend>
              <Field label="Name" error={fieldErrors[`locations.${i}.name`]}>
                <Input value={loc.name} onChange={(e) => setLoc(i, "name", e.target.value)} />
              </Field>
              <Field label="Address">
                <Input value={loc.address} onChange={(e) => setLoc(i, "address", e.target.value)} />
              </Field>
              <Field label="Latitude" hint="For GPS validation (optional)">
                <Input inputMode="decimal" value={loc.latitude} onChange={(e) => setLoc(i, "latitude", e.target.value)} placeholder="-29.8587" />
              </Field>
              <Field label="Longitude">
                <Input inputMode="decimal" value={loc.longitude} onChange={(e) => setLoc(i, "longitude", e.target.value)} placeholder="31.0218" />
              </Field>
              {d.locationMode === "MULTIPLE" && d.locations.length > 1 && (
                <button
                  type="button"
                  onClick={() => set("locations", d.locations.filter((_, j) => j !== i))}
                  className="flex items-center gap-1.5 text-xs text-red-600 sm:col-span-2"
                >
                  <Trash2 className="size-3.5" aria-hidden /> Remove
                </button>
              )}
            </fieldset>
          ))}

          {d.locationMode === "MULTIPLE" && (
            <Button variant="secondary-light" size="sm" icon={<Plus className="size-4" />} onClick={() => set("locations", [...d.locations, { ...emptyLocation }])} className="w-fit">
              Add another location
            </Button>
          )}
          {typeof fieldErrors.locations === "string" && <FormMessage error={fieldErrors.locations} />}
        </div>
      )}

      <FormMessage error={error} />

      {step === STEPS.length - 1 && (
        <p className="rounded-[12px] bg-pale-green px-3.5 py-2.5 text-[13px] text-ink">
          Your <b>{TRIAL_DAYS}-day free trial</b> starts as soon as you create your account. No card needed.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="secondary-light" icon={<ArrowLeft className="size-4" />} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        ) : (
          <button type="button" onClick={() => onSwitch("login")} className="text-sm text-muted hover:text-ink">
            Have an account? <span className="font-medium text-dark-green">Log in</span>
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={next} showArrow>Continue</Button>
        ) : (
          <Button onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create account"}</Button>
        )}
      </div>
    </div>
  );

  function setLoc(i: number, key: keyof Draft["locations"][number], value: string) {
    set("locations", d.locations.map((l, j) => (j === i ? { ...l, [key]: value } : l)));
  }
}
