import { Coffee, HardHat, ShoppingBag, Sprout, Shield, Truck, Cross } from "lucide-react";
import type { Industry } from "./types";

export const industries: (Industry & { colorClassName: string })[] = [
  { label: "Cafes & Restaurants", icon: Coffee, colorClassName: "text-dark-green" },
  { label: "Construction", icon: HardHat, colorClassName: "text-ink" },
  { label: "Retail", icon: ShoppingBag, colorClassName: "text-ink" },
  { label: "Farming & Agriculture", icon: Sprout, colorClassName: "text-dark-green" },
  { label: "Security", icon: Shield, colorClassName: "text-dark-green" },
  { label: "Logistics", icon: Truck, colorClassName: "text-ink" },
  { label: "Healthcare", icon: Cross, colorClassName: "text-dark-green" },
];
