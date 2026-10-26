"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarX, Home as HomeIcon, Palmtree, Users2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatBar } from "@/components/stat-bar";
import { useUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { monthLabel } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/roles";

type Stats = {
  workingDays: number;
  present: number;
  late: number;
  leave: number;
  wfh: number;
  absent: number;
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
  employees: {
    id: string;
    name: string;
    email: string;
    role: string;
    department: string | null;
    pictureUrl: string | null;
    stats: Stats;
  }[];
};

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>
        <div>
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((err) => {
        if (err instanceof Error && err.message.includes("permission")) setDenied(true);
        else toast.error(err instanceof Error ? err.message : "Could not load the dashboard.");
      });
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.month.label} at a glance` : "Loading…"}
        </p>
      </div>

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Employees" value={data.summary.employees} icon={Users2} />
            <SummaryCard label="Present today" value={data.summary.presentToday} icon={Users2} />
            <SummaryCard label="On leave today" value={data.summary.onLeaveToday} icon={Palmtree} />
            <SummaryCard label="WFH today" value={data.summary.wfhToday} icon={HomeIcon} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.employees.map((employee) => {
              const s = employee.stats;
              const pct = s.workingDays > 0 ? Math.round(((s.present + s.late) / s.workingDays) * 100) : 0;
              return (
                <Card key={employee.id}>
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
                      <div className="text-right">
                        <div className="text-lg font-semibold leading-none">{pct}%</div>
                        <div className="text-[10px] text-muted-foreground">present</div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <StatBar stats={s} />
                      <p className="text-xs text-muted-foreground">
                        {s.present} present · {s.late} late · {s.leave} leave · {s.wfh} WFH · {s.absent} absent
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
        </>
      )}
    </div>
  );
}
