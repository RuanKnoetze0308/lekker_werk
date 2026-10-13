import { describe, expect, it } from "vitest";
import { classifyDay, type DayContext } from "@/server/attendance/derive";
import { computePayLines, type PayDay } from "@/server/attendance/paycodes";
import { periodContaining } from "@/lib/pay-periods";
import { easterSunday, southAfricanHolidays } from "@/lib/sa-holidays";
import type { ResolvedDaySchedule } from "@/server/services/schedule.service";

describe("South African public holidays", () => {
  it("computes Easter correctly", () => {
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
  });

  it("lists 2026 including the Sunday -> Monday rule", () => {
    const h = southAfricanHolidays(2026).map((x) => x.date);
    expect(h).toContain("2026-04-03"); // Good Friday
    expect(h).toContain("2026-04-06"); // Family Day
    expect(h).toContain("2026-08-09"); // Women's Day (Sunday)...
    expect(h).toContain("2026-08-10"); // ...observed Monday
    expect(h).toHaveLength(13);
  });

  it("pushes a Sunday holiday past a Monday that is already a holiday", () => {
    // 2027: Christmas on Saturday, Day of Goodwill on Sunday -> observed Monday 27 Dec.
    const h = southAfricanHolidays(2027);
    expect(h.find((x) => x.date === "2027-12-27")?.name).toMatch(/Goodwill/);
    expect(h.find((x) => x.date === "2027-03-22")?.name).toMatch(/Human Rights/); // 21 Mar is a Sunday
  });
});

describe("pay periods", () => {
  const base = { anchorDate: "2026-01-05", monthStartDay: 1 };
  it("calendar months", () => {
    expect(periodContaining("2026-10-13", { ...base, frequency: "MONTHLY" })).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });
  it("26th-to-25th months, across the year end", () => {
    const s = { ...base, frequency: "MONTHLY" as const, monthStartDay: 26 };
    expect(periodContaining("2026-10-13", s)).toEqual({ start: "2026-09-26", end: "2026-10-25" });
    expect(periodContaining("2026-12-28", s)).toEqual({ start: "2026-12-26", end: "2027-01-25" });
    expect(periodContaining("2027-01-03", s)).toEqual({ start: "2026-12-26", end: "2027-01-25" });
  });
  it("weekly and fortnightly from the anchor", () => {
    expect(periodContaining("2026-10-14", { ...base, frequency: "WEEKLY" })).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(periodContaining("2026-01-18", { ...base, frequency: "FORTNIGHTLY" })).toEqual({ start: "2026-01-05", end: "2026-01-18" });
    expect(periodContaining("2026-01-04", { ...base, frequency: "WEEKLY" })).toEqual({ start: "2025-12-29", end: "2026-01-04" });
  });
});

const schedule: ResolvedDaySchedule = {
  scheduleId: "s",
  startMinutes: 480,
  endMinutes: 1020,
  scheduledMinutes: 480,
  breakMinutes: 60,
  graceMinutes: 5,
  overtimeAfterMinutes: null,
};
const ctx = (over: Partial<DayContext>): DayContext => ({
  summary: null,
  schedule,
  mealBreakPaid: false,
  leave: null,
  publicHoliday: false,
  closure: null,
  dayIsOver: true,
  ...over,
});

describe("classifying a day", () => {
  it("scheduled, not clocked, day over -> absent", () => {
    expect(classifyDay(ctx({}))?.status).toBe("ABSENT");
  });
  it("today and not clocked yet -> nothing recorded", () => {
    expect(classifyDay(ctx({ dayIsOver: false }))).toBeNull();
  });
  it("unscheduled day -> nothing recorded", () => {
    expect(classifyDay(ctx({ schedule: null }))).toBeNull();
  });
  it("approved leave -> on leave for the scheduled minutes", () => {
    const d = classifyDay(ctx({ leave: { leaveTypeId: "sick", fraction: 1 } }))!;
    expect(d).toMatchObject({ status: "ON_LEAVE", leaveMinutes: 480, leaveTypeId: "sick" });
  });
  it("half-day leave", () => {
    expect(classifyDay(ctx({ leave: { leaveTypeId: "annual", fraction: 0.5 } }))!.leaveMinutes).toBe(240);
  });
  it("public holiday beats leave", () => {
    const d = classifyDay(ctx({ publicHoliday: true, leave: { leaveTypeId: "annual", fraction: 1 } }))!;
    expect(d).toMatchObject({ status: "PUBLIC_HOLIDAY", leaveMinutes: 0 });
  });
  it("site closure -> paid stand-down minutes", () => {
    expect(classifyDay(ctx({ closure: { paid: true } }))).toMatchObject({ status: "SITE_CLOSED", closureMinutes: 480, closurePaid: true });
  });
});

const day = (over: Partial<PayDay>): PayDay => ({
  workDate: "2026-10-12",
  status: "PRESENT",
  workedMinutes: 480,
  overtimeMinutes: 0,
  scheduledMinutes: 480,
  leaveMinutes: 0,
  leaveCode: null,
  publicHoliday: false,
  closureMinutes: 0,
  closurePaid: false,
  ...over,
});
const terms = { contractedMinutesPerWeek: 2400, overtimeEligible: true };

describe("pay codes", () => {
  it("splits normal and daily overtime", () => {
    const l = computePayLines([day({ workedMinutes: 570, overtimeMinutes: 90 })], terms);
    expect(l.NORMAL.minutes).toBe(480);
    expect(l.OVERTIME.minutes).toBe(90);
  });

  it("moves ordinary time above the contracted week into overtime", () => {
    // Six 8h weekdays... (Mon-Sat) against a 40h contract = 8h overtime.
    const week = ["12", "13", "14", "15", "16", "17"].map((d) => day({ workDate: `2026-10-${d}` }));
    const l = computePayLines(week, terms);
    expect(l.NORMAL.minutes).toBe(2400);
    expect(l.OVERTIME.minutes).toBe(480);
  });

  it("separates Sunday and public holiday work", () => {
    const l = computePayLines(
      [day({ workDate: "2026-10-11" }), day({ workDate: "2026-09-24", publicHoliday: true })],
      terms,
    );
    expect(l.SUNDAY.minutes).toBe(480);
    expect(l.PUBLIC_HOLIDAY_WORKED.minutes).toBe(480);
    expect(l.NORMAL).toBeUndefined();
  });

  it("reports leave, paid holidays, absence and closures", () => {
    const l = computePayLines(
      [
        day({ status: "ON_LEAVE", workedMinutes: 0, leaveMinutes: 480, leaveCode: "SICK" }),
        day({ status: "ON_LEAVE", workedMinutes: 0, leaveMinutes: 240, leaveCode: "ANNUAL", workDate: "2026-10-13" }),
        day({ status: "PUBLIC_HOLIDAY", workedMinutes: 0, publicHoliday: true, workDate: "2026-09-24" }),
        day({ status: "ABSENT", workedMinutes: 0, workDate: "2026-10-14" }),
        day({ status: "SITE_CLOSED", workedMinutes: 0, closureMinutes: 480, closurePaid: false, workDate: "2026-10-15" }),
      ],
      terms,
    );
    expect(l.LEAVE_SICK).toEqual({ minutes: 480, days: 1 });
    expect(l.LEAVE_ANNUAL).toEqual({ minutes: 240, days: 0.5 });
    expect(l.PUBLIC_HOLIDAY).toEqual({ minutes: 480, days: 1 });
    expect(l.ABSENT).toEqual({ minutes: 480, days: 1 });
    expect(l.CLOSURE_UNPAID.minutes).toBe(480);
  });

  it("salaried without overtime reports everything as normal", () => {
    const l = computePayLines([day({ workedMinutes: 570, overtimeMinutes: 90 })], { ...terms, overtimeEligible: false });
    expect(l.NORMAL.minutes).toBe(570);
    expect(l.OVERTIME).toBeUndefined();
  });
});
