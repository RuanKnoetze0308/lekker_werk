import { CheckCheck } from "lucide-react";

interface LogoProps {
  variant?: "dark" | "light";
  tagline?: string;
}

export function Logo({ variant = "dark", tagline }: LogoProps) {
  const textColor = variant === "dark" ? "text-ink" : "text-white";
  const mutedColor = variant === "dark" ? "text-muted" : "text-white/60";

  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-brand-green text-ink">
        <CheckCheck className="size-[18px]" aria-hidden />
      </span>
      <span className="flex flex-col leading-none">
        <span className={`font-display text-[17px] font-bold ${textColor}`}>
          Lekker<span className="text-dark-green">Werk</span>
        </span>
        {tagline && (
          <span className={`text-[9px] font-semibold tracking-wide ${mutedColor}`}>
            {tagline}
          </span>
        )}
      </span>
    </div>
  );
}
