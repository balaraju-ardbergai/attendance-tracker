"use client";

import { useEffect, useState } from "react";
import { Clock, GraduationCap, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatBar } from "@/components/stat-bar";
import { api, timeLabel } from "@/lib/client";
import { formatKey } from "@/lib/dates";
import { ATTENDANCE_STATUS_LABEL, ROLE_LABEL, TASK_STATUS_LABEL } from "@/lib/roles";
import Link from "next/link";

type Stats = { workingDays: number; present: number; leave: number; wfh: number; absent: number };

type Overview = {
  person: { id: string; name: string; email: string; role: string; department: string | null; pictureUrl: string | null };
  today: { status: string; clockInAt: string | null; clockOutAt: string | null } | null;
  stats: Stats;
  openTasks: { id: string; key: string | null; title: string; status: string; progress: number; dueDate: string | null; projectId?: string | null }[];
  courses: { id: string; name: string; percent: number }[];
  pendingRequests: { type: string; startDate: string; endDate: string }[];
};

// Employee drill-down dialog used by the dashboard, team pages and the org
// graph. Fetches /api/employees/[id]/overview (lead/manager/HR scoped).
export function EmployeeDetailDialog({
  employeeId,
  onClose,
}: {
  employeeId: string | null;
  onClose: () => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employeeId) {
      setOverview(null);
      setError(null);
      return;
    }
    api<Overview>(`/api/employees/${employeeId}/overview`)
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the details."));
  }, [employeeId]);

  return (
    <Dialog open={employeeId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {overview ? overview.person.name : "Loading…"}
            {overview && (
              <Badge variant="secondary" className="text-[10px]">
                {ROLE_LABEL[overview.person.role as keyof typeof ROLE_LABEL] ?? overview.person.role}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{overview?.person.email}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : !overview ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Clock className="h-4 w-4 text-muted-foreground" /> Today
                  </span>
                  {overview.today ? (
                    <span className="text-muted-foreground">
                      {ATTENDANCE_STATUS_LABEL[overview.today.status]}
                      {overview.today.clockInAt ? ` · in ${timeLabel(overview.today.clockInAt)}` : ""}
                      {overview.today.clockOutAt ? ` · out ${timeLabel(overview.today.clockOutAt)}` : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not marked yet</span>
                  )}
                </div>
                <StatBar stats={overview.stats} />
                <p className="text-xs text-muted-foreground">
                  {overview.stats.workingDays} working days · {overview.stats.present} present · {overview.stats.leave} leave ·{" "}
                  {overview.stats.wfh} WFH · {overview.stats.absent} absent
                </p>
                {overview.pendingRequests.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
                    <p className="font-medium text-foreground">Pending requests</p>
                    {overview.pendingRequests.map((r, i) => (
                      <p key={i} className="text-muted-foreground">
                        {r.type === "LEAVE" ? "Leave" : "WFH"}: {formatKey(r.startDate)} → {formatKey(r.endDate)}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div>
              <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium">
                <ListTodo className="h-4 w-4 text-muted-foreground" /> Open tasks ({overview.openTasks.length})
              </p>
              <div className="space-y-1.5">
                {overview.openTasks.length === 0 && <p className="text-sm text-muted-foreground">No open tasks.</p>}
                {overview.openTasks.slice(0, 5).map((t) =>
                  t.projectId ? (
                    <Link
                      key={t.id}
                      href={`/projects/${t.projectId}?issue=${t.id}`}
                      className="flex items-center gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">{t.key ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="text-xs text-muted-foreground">{t.progress}%</span>
                      <Badge variant="outline" className="text-[10px]">{TASK_STATUS_LABEL[t.status]}</Badge>
                    </Link>
                  ) : (
                    <div key={t.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <span className="font-mono text-[10px] text-muted-foreground">{t.key ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="text-xs text-muted-foreground">{t.progress}%</span>
                      <Badge variant="outline" className="text-[10px]">{TASK_STATUS_LABEL[t.status]}</Badge>
                    </div>
                  ),
                )}
                {overview.openTasks.length > 5 && (
                  <p className="text-xs text-muted-foreground">+{overview.openTasks.length - 5} more on the Projects page.</p>
                )}
              </div>
            </div>

            {overview.courses.length > 0 && (
              <div>
                <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" /> Courses
                </p>
                <div className="flex flex-wrap gap-2">
                  {overview.courses.map((c) => (
                    <Link
                      key={c.id}
                      href={`/courses/${c.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted/50"
                    >
                      {c.name}
                      <span className="font-semibold">{c.percent}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
