"use client";

import { cn } from "@/lib/utils";
import { weekdayOf } from "@/lib/client";
import { ATTENDANCE_STATUS_LABEL, STATUS_TONE } from "@/lib/roles";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Simple Monday-first month calendar with attendance status marks.
export function MonthGrid({
  year,
  month,
  todayKey,
  records,
}: {
  year: number;
  month: number; // 0-based
  todayKey: string;
  records: Record<string, string>;
}) {
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }),
  ];

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((key, i) => {
          if (!key) return <div key={`pad-${i}`} />;
          const status = records[key];
          const dow = weekdayOf(key);
          const isWeekend = dow === 0 || dow === 6;
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={cn(
                "relative min-h-14 rounded-md border p-1.5 text-xs sm:min-h-16",
                isWeekend && "bg-muted/40 text-muted-foreground",
                isToday && "border-primary ring-2 ring-primary/40",
              )}
            >
              <span className={cn("font-medium", isToday && "text-primary")}>{Number(key.slice(8))}</span>
              {status && (
                <div className="absolute inset-x-1.5 bottom-1 flex items-center gap-1">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_TONE[status])} />
                  <span className="truncate text-[10px] leading-none text-muted-foreground">
                    {ATTENDANCE_STATUS_LABEL[status]}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
