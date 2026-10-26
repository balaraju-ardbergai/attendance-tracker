"use client";

import { cn } from "@/lib/utils";

export type StatCounts = {
  present: number;
  leave: number;
  wfh: number;
  absent: number;
};

const SEGMENTS: { key: keyof StatCounts; className: string; label: string }[] = [
  { key: "present", className: "bg-emerald-500", label: "Present" },
  { key: "leave", className: "bg-violet-500", label: "Leave" },
  { key: "wfh", className: "bg-sky-500", label: "WFH" },
  { key: "absent", className: "bg-rose-500", label: "Absent" },
];

// Combined progress bar: attendance, leave and WFH shares on a single track.
export function StatBar({ stats, className }: { stats: StatCounts; className?: string }) {
  const total = SEGMENTS.reduce((sum, s) => sum + stats[s.key], 0);
  return (
    <div className={cn("flex h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      {SEGMENTS.map((s) =>
        stats[s.key] > 0 ? (
          <div
            key={s.key}
            className={s.className}
            style={{ width: `${(stats[s.key] / total) * 100}%` }}
            title={`${stats[s.key]} ${s.label.toLowerCase()}`}
          />
        ) : null,
      )}
    </div>
  );
}

export function StatLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {SEGMENTS.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", s.className)} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
