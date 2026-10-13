import type { LucideIcon } from "lucide-react";

export interface Industry {
  label: string;
  icon: LucideIcon;
}

export interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
  tileClassName: string;
}

export interface Step {
  number: number;
  title: string;
  description: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  rating: number;
  avatarSrc: string;
}
