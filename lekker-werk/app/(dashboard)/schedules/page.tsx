import { Card, EmptyState, PageHeader } from "@/components/dashboard/ui";
import { requirePageContext } from "@/server/auth/guards";
import { listEmployees } from "@/server/services/employee.service";
import { listLocations } from "@/server/services/location.service";
import { listSchedules } from "@/server/services/schedule.service";
import { AssignScheduleButton, ScheduleEditorButton } from "./_components/ScheduleEditor";

export const metadata = { title: "Schedules · LekkerWerk" };

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function SchedulesPage() {
  const ctx = await requirePageContext("schedules:manage");
  const [schedules, locations, employees] = await Promise.all([
    listSchedules(ctx),
    listLocations(ctx),
    listEmployees(ctx, { page: 1, pageSize: 100, status: "ACTIVE" }),
  ]);

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Define working hours per day. Employees use their assigned schedule, then their location's, then the company default."
        actions={
          <>
            <AssignScheduleButton
              employees={employees.rows.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName} (#${e.employeeNumber})` }))}
              schedules={schedules.map((s) => ({ id: s.id, name: s.name }))}
            />
            <ScheduleEditorButton locations={locations} />
          </>
        }
      />

      {schedules.length === 0 ? (
        <Card><EmptyState title="No schedules yet" /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {schedules.map((s) => (
            <Card
              key={s.id}
              title={s.name}
              action={<ScheduleEditorButton locations={locations} schedule={s} />}
            >
              <p className="mb-3 text-xs text-muted">
                {s.locationName ?? "Company default"} · grace {s.graceMinutes} min
                {s.overtimeAfterMinutesPerDay ? ` · overtime after ${Math.round(s.overtimeAfterMinutesPerDay / 60 * 10) / 10}h/day` : ""}
              </p>
              <ul className="grid grid-cols-7 gap-1.5 text-center text-xs">
                {DAY_NAMES.map((name, i) => {
                  const d = s.days.find((x) => x.day === i + 1);
                  return (
                    <li key={name} className={`rounded-[10px] px-1 py-2 ${d ? "bg-pale-green text-ink" : "bg-soft-surface text-muted"}`}>
                      <p className="font-semibold">{name}</p>
                      <p className="mt-1">{d ? `${d.start}–${d.end}` : "Off"}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
