"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut as LogOutIcon,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MonthGrid } from "@/components/month-grid";
import { PageHeader } from "@/components/page-header";
import { RequestDialog } from "@/components/request-dialog";
import { StatBar, StatLegend } from "@/components/stat-bar";
import { api, getPosition, timeLabel } from "@/lib/client";
import { monthLabel } from "@/lib/dates";
import { ATTENDANCE_STATUS_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type RecordDto = {
  key: string;
  status: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  latitude: number | null;
  longitude: number | null;
};

type AttendanceData = {
  year: number;
  month: number;
  today: string;
  records: RecordDto[];
  stats: {
    workingDays: number;
    present: number;
    leave: number;
    wfh: number;
    absent: number;
  };
};

type PendingRequest = { id: string; type: string; startDate: string; endDate: string; status: string };

export default function AttendancePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [data, setData] = useState<AttendanceData | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async (y: number, m: number) => {
    try {
      const [attendance, requests] = await Promise.all([
        api<AttendanceData>(`/api/attendance?year=${y}&month=${m}`),
        api<{ requests: PendingRequest[] }>("/api/requests"),
      ]);
      setData(attendance);
      setPending(requests.requests.filter((r) => r.status === "PENDING").slice(0, 3));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load attendance.");
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [load, year, month]);

  const currentMonth = now.getFullYear() === year && now.getMonth() === month;
  const todayRecord = data?.records.find((r) => r.key === data.today);

  async function mark(action: "CLOCK_IN" | "CLOCK_OUT") {
    setBusy(true);
    try {
      const position = action === "CLOCK_IN" ? await getPosition() : null;
      const result = await api<{ message: string }>("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          action,
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
        }),
      });
      toast.success(result.message);
      await load(year, month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark attendance.");
    } finally {
      setBusy(false);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  }

  const stats = data?.stats;
  const recordMap = Object.fromEntries((data?.records ?? []).map((r) => [r.key, r.status]));

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Mark your day and track your month.">
        <Button onClick={() => setDialogOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> Request leave / WFH
        </Button>
      </PageHeader>

      {/* Today */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today</CardTitle>
          <CardDescription>
            {todayRecord
              ? ATTENDANCE_STATUS_LABEL[todayRecord.status]
              : currentMonth
                ? "You haven't marked attendance for today yet."
                : "Viewing a past month."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          {todayRecord ? (
            <>
              <Badge variant="default">
                {ATTENDANCE_STATUS_LABEL[todayRecord.status]}
              </Badge>
              <div className="text-sm text-muted-foreground">
                In <span className="font-medium text-foreground">{timeLabel(todayRecord.clockInAt)}</span>
                {" · "}
                Out <span className="font-medium text-foreground">{timeLabel(todayRecord.clockOutAt)}</span>
              </div>
              {todayRecord.latitude != null && todayRecord.longitude != null && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {todayRecord.latitude.toFixed(4)}, {todayRecord.longitude.toFixed(4)}
                </span>
              )}
              {!todayRecord.clockOutAt && (
                <Button variant="outline" size="sm" onClick={() => mark("CLOCK_OUT")} disabled={busy}>
                  <LogOutIcon className="h-4 w-4" /> Clock out
                </Button>
              )}
            </>
          ) : (
            currentMonth && (
              <Button onClick={() => mark("CLOCK_IN")} disabled={busy}>
                <LogIn className="h-4 w-4" /> {busy ? "Marking…" : "Mark attendance"}
              </Button>
            )
          )}
        </CardContent>
      </Card>

      {/* Month overview */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{monthLabel(year, month)}</CardTitle>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftMonth(1)}
                disabled={new Date(Date.UTC(year, month + 1, 1)) > now}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {data && <MonthGrid year={year} month={month} todayKey={data.today} records={recordMap} />}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This month</CardTitle>
              <CardDescription>
                {stats ? `${stats.workingDays} working days so far` : "…"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats && (
                <>
                  <StatBar stats={stats} />
                  <StatLegend />
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      ["Present", stats.present],
                      ["Leave", stats.leave],
                      ["WFH", stats.wfh],
                      ["Absent", stats.absent],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-md bg-muted/60 p-2">
                        <div className="text-lg font-semibold">{value}</div>
                        <div className="text-[11px] text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Pending requests</CardTitle>
              <Link href="/requests" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                Manage →
              </Link>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending requests.</p>
              ) : (
                <ul className="space-y-2">
                  {pending.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                      <span>
                        {r.type === "LEAVE" ? "Leave" : "WFH"} ·{" "}
                        <span className="text-muted-foreground">
                          {r.startDate.slice(0, 10)} → {r.endDate.slice(0, 10)}
                        </span>
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(r.status === "PENDING" && "border-amber-500/50 text-amber-600")}
                      >
                        Pending
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <RequestDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmitted={() => load(year, month)} />
    </div>
  );
}
