"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarX,
  Clock,
  GraduationCap,
  Home as HomeIcon,
  ListTodo,
  Palmtree,
  Users2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatBar } from "@/components/stat-bar";
import { PageHeader } from "@/components/page-header";
import { useUser } from "@/components/user-context";
import { api, initials, timeLabel } from "@/lib/client";
import { formatKey } from "@/lib/dates";
import { ROLE_LABEL, TASK_STATUS_LABEL, ATTENDANCE_STATUS_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type Stats = {
  workingDays: number;
  present: number;
  leave: number;
  wfh: number;
  absent: number;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  pictureUrl: string | null;
  todayStatus: string | null;
  stats: Stats;
};

type DashboardData = {
  month: { year: number; month: number; label: string };
  summary: {
    employees: number;
    presentToday: number;
    onLeaveToday: number;
    wfhToday: number;
    notMarkedToday: number;
  };
  employees: Employee[];
};

type Filter = "ALL" | "PRESENT" | "LEAVE" | "WFH" | "NOT_MARKED";

type Overview = {
  person: { id: string; name: string; email: string; role: string; department: string | null; pictureUrl: string | null };
  today: { status: string; clockInAt: string | null; clockOutAt: string | null } | null;
  stats: Stats;
  openTasks: { id: string; key: string | null; title: string; status: string; progress: number; dueDate: string | null }[];
  courses: { id: string; name: string; percent: number }[];
  pendingRequests: { type: string; startDate: string; endDate: string }[];
};

const FILTER_LABEL: Record<Filter, string> = {
  ALL: "Everyone",
  PRESENT: "Present today",
  LEAVE: "On leave today",
  WFH: "Working from home today",
  NOT_MARKED: "Not marked today",
};

export default function DashboardPage() {
  const me = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((err) => {
        if (err instanceof Error && err.message.includes("permission")) setDenied(true);
        else toast.error(err instanceof Error ? err.message : "Could not load the dashboard.");
      });
  }, []);

  function openOverview(id: string) {
    setOverviewLoading(true);
    setOverview(null);
    api<Overview>(`/api/employees/${id}/overview`)
      .then(setOverview)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not load the details.");
        setOverviewLoading(false);
      })
      .finally(() => setOverviewLoading(false));
  }

  function matchesFilter(employee: Employee, filter: Filter): boolean {
    switch (filter) {
      case "ALL": return true;
      case "PRESENT": return employee.todayStatus === "PRESENT";
      case "LEAVE": return employee.todayStatus === "LEAVE";
      case "WFH": return employee.todayStatus === "WFH";
      case "NOT_MARKED": return employee.todayStatus === null;
    }
  }

  if (denied) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Organization dashboard</CardTitle>
          <CardDescription>You don&apos;t have access to this page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/attendance">Back to attendance</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const todayBadgeTone = (status: string | null) =>
    status === "PRESENT"
      ? "border-emerald-500/50 text-emerald-600"
      : status === "LEAVE"
        ? "border-violet-500/50 text-violet-600"
        : status === "WFH"
          ? "border-sky-500/50 text-sky-600"
          : "text-muted-foreground";

  const filtered = data && filter ? data.employees.filter((e) => matchesFilter(e, filter)) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Organization" description={data ? `${data.month.label} at a glance` : "Loading…"} />

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Clickable summary cards — each opens the list of matching people */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <SummaryCard label="Employees" sub="everyone active" value={data.summary.employees} icon={Users2} onClick={() => setFilter("ALL")} />
            <SummaryCard label="Present today" sub="click to see who" value={data.summary.presentToday} icon={Users2} onClick={() => setFilter("PRESENT")} />
            <SummaryCard label="On leave today" sub="click to see who" value={data.summary.onLeaveToday} icon={Palmtree} onClick={() => setFilter("LEAVE")} />
            <SummaryCard label="WFH today" sub="click to see who" value={data.summary.wfhToday} icon={HomeIcon} onClick={() => setFilter("WFH")} />
            <SummaryCard label="Not marked today" sub="click to see who" value={data.summary.notMarkedToday} icon={CalendarX} onClick={() => setFilter("NOT_MARKED")} />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Employees</h2>
              <p className="text-xs text-muted-foreground">Click a card for attendance, tasks and courses.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.employees.map((employee) => {
                const s = employee.stats;
                const pct = s.workingDays > 0 ? Math.round((s.present / s.workingDays) * 100) : 0;
                return (
                  <Card
                    key={employee.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => openOverview(employee.id)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-11 w-11">
                          {employee.pictureUrl && <AvatarImage src={employee.pictureUrl} alt={employee.name} />}
                          <AvatarFallback>{initials(employee.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{employee.name}</p>
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {ROLE_LABEL[employee.role as keyof typeof ROLE_LABEL] ?? employee.role}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{employee.email}</p>
                          {employee.department && (
                            <p className="text-xs text-muted-foreground">{employee.department}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="text-lg font-semibold leading-none">{pct}%</div>
                          <div className="text-[10px] text-muted-foreground">present</div>
                          <Badge variant="outline" className={cn("text-[10px]", todayBadgeTone(employee.todayStatus))}>
                            {employee.todayStatus ? ATTENDANCE_STATUS_LABEL[employee.todayStatus] : "Not marked"}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <StatBar stats={s} />
                        <p className="text-xs text-muted-foreground">
                          {s.present} present · {s.leave} leave · {s.wfh} WFH · {s.absent} absent
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {data.employees.length === 0 && (
                <Card>
                  <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                    <CalendarX className="h-4 w-4" /> No employees found.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* People list for a summary card */}
      <Dialog open={filter !== null} onOpenChange={(open) => !open && setFilter(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{filter ? FILTER_LABEL[filter] : ""}</DialogTitle>
            <DialogDescription>
              {filtered.length} people{filter === "NOT_MARKED" ? " — nudge them to mark attendance." : "."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {filtered.map((e) => (
              <button
                key={e.id}
                className="flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50"
                onClick={() => {
                  setFilter(null);
                  openOverview(e.id);
                }}
              >
                <Avatar className="h-8 w-8">
                  {e.pictureUrl && <AvatarImage src={e.pictureUrl} alt={e.name} />}
                  <AvatarFallback className="text-xs">{initials(e.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.department ?? e.email}</p>
                </div>
                <Badge variant="outline" className={cn("text-[10px]", todayBadgeTone(e.todayStatus))}>
                  {e.todayStatus ? ATTENDANCE_STATUS_LABEL[e.todayStatus] : "Not marked"}
                </Badge>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nobody in this group right now.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Employee drill-down */}
      <Dialog open={overview !== null || overviewLoading} onOpenChange={(open) => !open && setOverview(null)}>
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
          {!overview ? (
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
                  {overview.openTasks.slice(0, 5).map((t) => (
                    <div key={t.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <span className="font-mono text-[10px] text-muted-foreground">{t.key ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="text-xs text-muted-foreground">{t.progress}%</span>
                      <Badge variant="outline" className="text-[10px]">{TASK_STATUS_LABEL[t.status]}</Badge>
                    </div>
                  ))}
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
                      <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                        {c.name}
                        <span className="font-semibold">{c.percent}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {me?.role !== "DIRECTOR" && me?.role !== "ADMIN" && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <X className="h-3 w-3" /> You are viewing this person because they are part of your team.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  sub,
  value,
  icon: Icon,
  onClick,
}: {
  label: string;
  sub: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-primary/30"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {label} · <span className="underline decoration-dotted underline-offset-2">{sub}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
