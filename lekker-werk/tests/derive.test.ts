import { describe, expect, it } from "vitest";
import { buildShifts, summariseDay, type EventLite } from "@/server/attendance/derive";
import type { MealBreakPolicy } from "@/db/schema/system";
import type { ResolvedDaySchedule } from "@/server/services/schedule.service";

const TZ = "Africa/Johannesburg";
const at = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00+02:00`);
const ev = (eventType: EventLite["eventType"], hhmm: string): EventLite => ({ eventType, occurredAt: at(hhmm) });

const nineToFive: ResolvedDaySchedule = {
  scheduleId: "s",
  startMinutes: 8 * 60,
  endMinutes: 17 * 60,
  scheduledMinutes: 8 * 60, // 9h span minus 60 min lunch
  breakMinutes: 60,
  graceMinutes: 5,
  overtimeAfterMinutes: null,
};

const auto: MealBreakPolicy = { policy: "AUTO_DEDUCT", minutes: 60, afterMinutes: 300, paid: false };

function day(events: EventLite[], mealBreak: MealBreakPolicy = auto, schedule: ResolvedDaySchedule | null = nineToFive) {
  return summariseDay(buildShifts(events), {
    now: at("23:59"),
    timeZone: TZ,
    maxShiftHours: 16,
    schedule,
    overtimeAfterDefault: 540,
    mealBreak,
  })!;
}

describe("meal break", () => {
  it("deducts unclocked lunch so a normal day is not overtime", () => {
    const d = day([ev("CLOCK_IN", "08:00"), ev("CLOCK_OUT", "17:00")]);
    expect(d.workedMinutes).toBe(480);
    expect(d.autoBreakMinutes).toBe(60);
    expect(d.overtimeMinutes).toBe(0);
  });

  it("uses a clocked break instead of deducting again", () => {
    const d = day([ev("CLOCK_IN", "08:00"), ev("BREAK_START", "12:00"), ev("BREAK_END", "13:00"), ev("CLOCK_OUT", "17:00")]);
    expect(d.workedMinutes).toBe(480);
    expect(d.breakMinutes).toBe(60);
    expect(d.autoBreakMinutes).toBe(0);
  });

  it("only tops up a short clocked break", () => {
    const d = day([ev("CLOCK_IN", "08:00"), ev("BREAK_START", "12:00"), ev("BREAK_END", "12:20"), ev("CLOCK_OUT", "17:00")]);
    expect(d.autoBreakMinutes).toBe(40);
    expect(d.workedMinutes).toBe(480);
  });

  it("does not deduct on a short day", () => {
    const d = day([ev("CLOCK_IN", "08:00"), ev("CLOCK_OUT", "12:00")]);
    expect(d.workedMinutes).toBe(240);
    expect(d.autoBreakMinutes).toBe(0);
  });

  it("counts real overtime after the break", () => {
    const d = day([ev("CLOCK_IN", "08:00"), ev("CLOCK_OUT", "18:30")]);
    expect(d.workedMinutes).toBe(570);
    expect(d.overtimeMinutes).toBe(90);
  });

  it("CLOCKED policy leaves unclocked time as worked", () => {
    const d = day([ev("CLOCK_IN", "08:00"), ev("CLOCK_OUT", "17:00")], { ...auto, policy: "CLOCKED" });
    expect(d.workedMinutes).toBe(540);
    expect(d.autoBreakMinutes).toBe(0);
  });

  it("paid break counts as worked and as scheduled", () => {
    const d = day([ev("CLOCK_IN", "08:00"), ev("CLOCK_OUT", "17:00")], { ...auto, paid: true });
    expect(d.workedMinutes).toBe(540);
    expect(d.scheduledMinutes).toBe(540);
    expect(d.overtimeMinutes).toBe(0);
  });

  it("uses the company default length on unscheduled days", () => {
    const d = day([ev("CLOCK_IN", "09:00"), ev("CLOCK_OUT", "16:00")], { ...auto, minutes: 30 }, null);
    expect(d.workedMinutes).toBe(390);
  });
});

describe("lateness", () => {
  it("flags arrivals after the grace period", () => {
    const d = day([ev("CLOCK_IN", "08:20"), ev("CLOCK_OUT", "17:00")]);
    expect(d.lateMinutes).toBe(20);
    expect(d.status).toBe("LATE");
  });
});
