import type { CompanySettingsShape } from "@/db/schema/system";

export const DEFAULT_COMPANY_SETTINGS: CompanySettingsShape = {
  attendance: {
    mealBreak: { policy: "AUTO_DEDUCT", minutes: 60, afterMinutes: 300, paid: false },
    gpsValidationEnabled: false,
    requireQrForClocking: true,
    allowedRadiusMeters: 150,
    duplicateWindowSeconds: 60,
    maxShiftHours: 16,
    breaksEnabled: true,
    overtimeAfterMinutesPerDay: 540,
    workingWeek: [1, 2, 3, 4, 5],
  },
};

/** What employees can request over WhatsApp/Telegram. Admins toggle each ON/OFF. */
export const EMPLOYEE_DATA_KEYS = [
  { key: "today_hours", label: "Today's hours", defaultOn: true },
  { key: "weekly_hours", label: "Weekly hours", defaultOn: true },
  { key: "monthly_hours", label: "Monthly hours", defaultOn: false },
  { key: "last_clock_in", label: "Last clock-in", defaultOn: true },
  { key: "last_clock_out", label: "Last clock-out", defaultOn: true },
  { key: "current_status", label: "Current status", defaultOn: true },
  { key: "leave_balance", label: "Leave balance", defaultOn: false },
  { key: "payslip", label: "Payslip", defaultOn: false },
  { key: "schedule", label: "Schedule", defaultOn: true },
  { key: "overtime", label: "Overtime", defaultOn: false },
  { key: "attendance_history", label: "Attendance history", defaultOn: false },
] as const;

export type EmployeeDataKey = (typeof EMPLOYEE_DATA_KEYS)[number]["key"];

export const DEFAULT_SCHEDULE_DAYS = [1, 2, 3, 4, 5].map((day) => ({
  day,
  start: "08:00",
  end: "17:00",
  breakMinutes: 60,
}));

export const TIMEZONES = [
  "Africa/Johannesburg",
  "Africa/Windhoek",
  "Africa/Maputo",
  "Africa/Harare",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Europe/London",
  "UTC",
];
