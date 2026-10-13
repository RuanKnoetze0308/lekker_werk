import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Variant = "primary" | "secondary-dark" | "secondary-light" | "ink" | "danger";
type Size = "md" | "sm";

interface BaseProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  icon?: ReactNode;
  showArrow?: boolean;
}

interface ButtonAsLink extends BaseProps {
  href: string;
}

interface ButtonAsButton
  extends BaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  href?: undefined;
}

type ButtonProps = ButtonAsLink | ButtonAsButton;

const variantClasses: Record<Variant, string> = {
  primary: "bg-brand-green text-ink hover:bg-dark-green hover:text-white",
  "secondary-dark": "bg-transparent text-white border border-white/25 hover:border-white/50",
  "secondary-light": "bg-white text-ink border border-border hover:border-ink/40",
  ink: "bg-ink text-white hover:bg-ink/85",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
};

const sizeClasses: Record<Size, string> = {
  md: "px-5 py-3 text-sm",
  sm: "px-3.5 py-2 text-[13px]",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-[13px] font-semibold transition-[transform,background-color,color,border-color] duration-200 active:translate-y-px disabled:pointer-events-none disabled:opacity-60";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  icon,
  showArrow = false,
  href,
  ...rest
}: ButtonProps) {
  const classes = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`;
  const content = (
    <>
      {icon}
      {children}
      {showArrow && <ArrowRight className="size-4" aria-hidden />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {content}
    </button>
  );
}
