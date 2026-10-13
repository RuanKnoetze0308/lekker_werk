import type { LucideIcon } from "lucide-react";

interface IconTileProps {
  icon: LucideIcon;
  className?: string;
}

export function IconTile({ icon: Icon, className = "" }: IconTileProps) {
  return (
    <div
      className={`flex size-11 items-center justify-center rounded-[13px] ${className}`}
    >
      <Icon className="size-5" aria-hidden />
    </div>
  );
}
