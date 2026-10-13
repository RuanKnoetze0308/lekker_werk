import { MessageCircle, MapPin, LineChart, CalendarCheck, Users, Bell } from "lucide-react";
import type { Feature } from "./types";

export const features: Feature[] = [
  {
    title: "Clock in via WhatsApp or Telegram",
    description: "Your team clocks in and out with a simple message. No app downloads.",
    icon: MessageCircle,
    tileClassName: "bg-[#EAF9ED] text-[#16A34A]",
  },
  {
    title: "Location tracking",
    description: "See where your team clocks in from with GPS location.",
    icon: MapPin,
    tileClassName: "bg-[#F1EAFB] text-[#7C3AED]",
  },
  {
    title: "Time reports",
    description: "Get clear reports on hours, late arrivals and attendance.",
    icon: LineChart,
    tileClassName: "bg-[#FDECE1] text-[#EA580C]",
  },
  {
    title: "Leave management",
    description: "Approve leave requests easily, right from your dashboard.",
    icon: CalendarCheck,
    tileClassName: "bg-[#EAF9ED] text-[#16A34A]",
  },
  {
    title: "Team management",
    description: "Manage multiple locations, teams and shift schedules.",
    icon: Users,
    tileClassName: "bg-[#FCE7F0] text-[#DB2777]",
  },
  {
    title: "Real-time notifications",
    description: "Get notified of clock ins, clock outs and important activity.",
    icon: Bell,
    tileClassName: "bg-[#E3EFFD] text-[#2563EB]",
  },
];
