"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarPlus,
  ExternalLink,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { formatKey } from "@/lib/dates";
import { COURSE_ATTENDANCE_LABEL, COURSE_STATUS_LABEL, ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type Milestone = {
  id: string;
  courseId: string;
  order: number;
  name: string;
  description: string | null;
  link: string | null;
  durationMin: number | null;
  phase: string | null;
};

type MilestoneStat = { milestoneId: string; avgPercent: number; completed: number };

type Participant = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  pictureUrl: string | null;
  role: string;
  progress: Record<string, number>;
  summary: {
    stepsCompleted: number;
    totalSteps: number;
    percent: number;
    currentlyAt: { id: string; name: string } | null;
    status: string;
  };
};

type SessionDto = {
  id: string;
  date: string;
  topic: string | null;
  attendance: { userId: string; status: string }[];
};

type CourseData = {
  course: {
    id: string;
    name: string;
    description: string | null;
    startedOn: string | null;
    attendanceEnabled: boolean;
    scheduleNote: string | null;
    createdAt: string;
    creator: { id: string };
  };
  milestones: Milestone[];
  milestoneStats: MilestoneStat[];
  participants: Participant[];
  sessions: SessionDto[];
  canManage: boolean;
};

const PERCENT_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

function statusTone(status: string) {
  return status === "COMPLETED"
    ? "border-emerald-500/50 text-emerald-600"
    : status === "IN_PROGRESS"
      ? "border-amber-500/50 text-amber-600"
      : "text-muted-foreground";
}

export default function CourseDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const me = useUser();

  const [data, setData] = useState<CourseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api<CourseData>(`/api/courses/${courseId}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the course.");
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteCourse() {
    if (!window.confirm(`Delete “${data?.course.name}”? All milestones, progress and sessions will be removed.`)) return;
    try {
      await api(`/api/courses/${courseId}`, { method: "DELETE" });
      toast.success("Course deleted.");
      router.push("/courses");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the course.");
    }
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Course</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/courses">Back to courses</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { course, milestones, participants, sessions, canManage } = data;
  const statById = Object.fromEntries(data.milestoneStats.map((s) => [s.milestoneId, s]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/courses" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Courses
          </Link>
          <h1 className="text-2xl font-semibold">{course.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {course.startedOn && <span>Started {formatKey(course.startedOn.slice(0, 10))}</span>}
            {course.attendanceEnabled && (
              <Badge variant="secondary" className="text-[10px]">
                <CalendarDays className="mr-1 h-3 w-3" /> {course.scheduleNote ?? "Classes tracked"}
              </Badge>
            )}
            <span>{milestones.length} milestones</span>
            <span>{participants.length} participants</span>
          </div>
          {course.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{course.description}</p>}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10" onClick={deleteCourse}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="tracker">
        <TabsList className="flex-wrap">
          <TabsTrigger value="tracker">Tracker</TabsTrigger>
          {canManage && <TabsTrigger value="milestones">Milestones</TabsTrigger>}
          <TabsTrigger value="participants">Participants</TabsTrigger>
          {course.attendanceEnabled && <TabsTrigger value="sessions">Classes & attendance</TabsTrigger>}
        </TabsList>

        <TabsContent value="tracker" className="mt-4">
          <TrackerTab
            courseId={courseId}
            milestones={milestones}
            participants={participants}
            statById={statById}
            meId={me?.id ?? ""}
            canManage={canManage}
            onChanged={load}
          />
        </TabsContent>

        {canManage && (
          <TabsContent value="milestones" className="mt-4">
            <MilestonesTab courseId={courseId} milestones={milestones} statById={statById} onChanged={load} />
          </TabsContent>
        )}

        <TabsContent value="participants" className="mt-4">
          <ParticipantsTab courseId={courseId} participants={participants} canManage={canManage} onChanged={load} />
        </TabsContent>

        {course.attendanceEnabled && (
          <TabsContent value="sessions" className="mt-4">
            <SessionsTab
              courseId={courseId}
              sessions={sessions}
              participants={participants}
              canManage={canManage}
              meId={me?.id ?? ""}
              onChanged={load}
            />
          </TabsContent>
        )}
      </Tabs>

      <EditCourseDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        course={course}
        onSaved={load}
      />
    </div>
  );
}

/* ---------------------------------- Tracker ---------------------------------- */

function phaseRuns(milestones: Milestone[]) {
  // Group consecutive milestones sharing the same phase label, like the sheet's column groups.
  const runs: { label: string; span: number }[] = [];
  for (const m of milestones) {
    const label = m.phase ?? "STEP";
    const last = runs[runs.length - 1];
    if (last && last.label === label) last.span += 1;
    else runs.push({ label, span: 1 });
  }
  return runs;
}

function TrackerTab({
  courseId,
  milestones,
  participants,
  statById,
  meId,
  canManage,
  onChanged,
}: {
  courseId: string;
  milestones: Milestone[];
  participants: Participant[];
  statById: Record<string, MilestoneStat>;
  meId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  if (milestones.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No milestones yet{canManage ? " — add them in the Milestones tab." : "."}
        </CardContent>
      </Card>
    );
  }
  if (participants.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No participants yet{canManage ? " — enroll people in the Participants tab." : "."}
        </CardContent>
      </Card>
    );
  }

  const runs = phaseRuns(milestones);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-44 bg-card">Participant</TableHead>
                {runs.map((run, i) => (
                  <TableHead key={`phase-${i}`} colSpan={run.span} className="border-l text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {run.label}
                  </TableHead>
                ))}
                <TableHead className="border-l text-center">Done</TableHead>
                <TableHead className="text-center">Progress</TableHead>
                <TableHead>Currently at</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card" />
                {milestones.map((m) => (
                  <TableHead key={m.id} className="min-w-40 border-l align-top">
                    <div className="text-xs font-medium leading-tight">{m.name}</div>
                    {m.durationMin != null && <div className="text-[10px] text-muted-foreground">{m.durationMin} min</div>}
                    <div className="text-[10px] text-muted-foreground">
                      org {statById[m.id]?.avgPercent ?? 0}%
                    </div>
                  </TableHead>
                ))}
                <TableHead className="border-l" />
                <TableHead />
                <TableHead />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="sticky left-0 z-10 bg-card">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        {p.pictureUrl && <AvatarImage src={p.pictureUrl} alt={p.name} />}
                        <AvatarFallback className="text-[10px]">{initials(p.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{p.department ?? p.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  {milestones.map((m) => {
                    const value = p.progress[m.id] ?? 0;
                    const editable = canManage || p.id === meId;
                    return (
                      <TableCell key={m.id} className="border-l">
                        <Select
                          value={String(value)}
                          disabled={!editable}
                          onValueChange={(v) => {
                            void updateProgress(courseId, m.id, p.id, Number(v)).then(onChanged);
                          }}
                        >
                          <SelectTrigger size="sm" className={cn("h-7 w-24 text-xs", value >= 100 && "border-emerald-500/60 text-emerald-600")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PERCENT_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={String(opt)}>
                                {opt === 0 ? "Not started" : opt === 100 ? "Completed" : `${opt}%`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    );
                  })}
                  <TableCell className="border-l text-center text-sm">
                    {p.summary.stepsCompleted}/{p.summary.totalSteps}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="text-sm font-medium">{p.summary.percent}%</div>
                    <div className="mx-auto mt-1 h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.summary.percent}%` }} />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-44 truncate text-xs text-muted-foreground">
                    {p.summary.currentlyAt?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusTone(p.summary.status)}>
                      {COURSE_STATUS_LABEL[p.summary.status] ?? p.summary.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

async function updateProgress(courseId: string, milestoneId: string, userId: string, percent: number) {
  try {
    const result = await api<{ message: string }>(`/api/courses/${courseId}/progress`, {
      method: "POST",
      body: JSON.stringify({ milestoneId, userId, percent }),
    });
    toast.success(result.message);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not update progress.");
  }
}

/* --------------------------------- Milestones --------------------------------- */

function MilestonesTab({
  courseId,
  milestones,
  statById,
  onChanged,
}: {
  courseId: string;
  milestones: Milestone[];
  statById: Record<string, MilestoneStat>;
  onChanged: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);

  async function move(m: Milestone, direction: "up" | "down") {
    try {
      await api(`/api/courses/${courseId}/milestones/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "MOVE", direction }),
      });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move the milestone.");
    }
  }

  async function remove(m: Milestone) {
    if (!window.confirm(`Delete milestone “${m.name}”? Its progress history will be removed.`)) return;
    try {
      await api(`/api/courses/${courseId}/milestones/${m.id}`, { method: "DELETE" });
      toast.success("Milestone deleted.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the milestone.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Milestones</CardTitle>
          <CardDescription>Ordered steps of the course with org-level progress.</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <UserPlus className="h-4 w-4" /> Add milestone
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {milestones.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No milestones yet.</p>
        )}
        {milestones.map((m, index) => {
          const stat = statById[m.id];
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <span className="w-6 text-center text-sm font-semibold text-muted-foreground">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {m.phase && <Badge variant="secondary" className="text-[10px]">{m.phase}</Badge>}
                  <p className="text-sm font-medium">{m.name}</p>
                  {m.durationMin != null && <span className="text-xs text-muted-foreground">{m.durationMin} min</span>}
                  {m.link && (
                    <a href={m.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary underline-offset-4 hover:underline">
                      link <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {m.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{m.description}</p>}
              </div>
              <div className="w-32">
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>org</span>
                  <span>{stat?.completed ?? 0} done</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stat?.avgPercent ?? 0}%` }} />
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => move(m, "up")} aria-label="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === milestones.length - 1} onClick={() => move(m, "down")} aria-label="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditing(m);
                    setDialogOpen(true);
                  }}
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-600" onClick={() => remove(m)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>

      <MilestoneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        courseId={courseId}
        milestone={editing}
        onSaved={() => {
          setDialogOpen(false);
          onChanged();
        }}
      />
    </Card>
  );
}

function MilestoneDialog({
  open,
  onOpenChange,
  courseId,
  milestone,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  milestone: Milestone | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [duration, setDuration] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(milestone?.name ?? "");
      setPhase(milestone?.phase ?? "");
      setDescription(milestone?.description ?? "");
      setLink(milestone?.link ?? "");
      setDuration(milestone?.durationMin != null ? String(milestone.durationMin) : "");
    }
  }, [open, milestone]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name,
        phase: phase || undefined,
        description: description || undefined,
        link: link || undefined,
        durationMin: duration ? Number(duration) : undefined,
      };
      if (milestone) {
        await api(`/api/courses/${courseId}/milestones/${milestone.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "UPDATE", ...payload }),
        });
        toast.success("Milestone updated.");
      } else {
        await api(`/api/courses/${courseId}/milestones`, { method: "POST", body: JSON.stringify(payload) });
        toast.success("Milestone added.");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the milestone.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{milestone ? "Edit milestone" : "Add milestone"}</DialogTitle>
          <DialogDescription>
            Steps are tracked in order. Phase groups them like PREREQUISITE / PREP COURSE / EXAM.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ms-name">Name</Label>
              <Input id="ms-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ms-phase">Phase</Label>
              <Input id="ms-phase" placeholder="PREREQUISITE / PREP COURSE / EXAM" value={phase} onChange={(e) => setPhase(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ms-desc">Description</Label>
            <Textarea id="ms-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="ms-link">Link</Label>
              <Input id="ms-link" type="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ms-duration">Minutes</Label>
              <Input id="ms-duration" type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : milestone ? "Save changes" : "Add milestone"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Participants -------------------------------- */

function ParticipantsTab({
  courseId,
  participants,
  canManage,
  onChanged,
}: {
  courseId: string;
  participants: Participant[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  async function removeParticipant(userId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this course? Their progress is kept if they re-enroll.`)) return;
    try {
      await api(`/api/courses/${courseId}/enrollments`, {
        method: "POST",
        body: JSON.stringify({ userId, action: "REMOVE" }),
      });
      toast.success("Participant removed.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the participant.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Participants</CardTitle>
          <CardDescription>People enrolled in this course.</CardDescription>
        </div>
        {canManage && <Button size="sm" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add participant</Button>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Participant</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Done</TableHead>
              <TableHead className="text-center">Progress</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nobody enrolled yet.
                </TableCell>
              </TableRow>
            )}
            {participants.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      {p.pictureUrl && <AvatarImage src={p.pictureUrl} alt={p.name} />}
                      <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{ROLE_LABEL[p.role as keyof typeof ROLE_LABEL] ?? p.role}</Badge></TableCell>
                <TableCell className="text-center text-sm">{p.summary.stepsCompleted}/{p.summary.totalSteps}</TableCell>
                <TableCell className="text-center text-sm font-medium">{p.summary.percent}%</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusTone(p.summary.status)}>
                    {COURSE_STATUS_LABEL[p.summary.status] ?? p.summary.status}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10" onClick={() => removeParticipant(p.id, p.name)}>
                      Remove
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {canManage && (
        <AddParticipantDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          courseId={courseId}
          enrolledIds={participants.map((p) => p.id)}
          onSaved={() => {
            setAddOpen(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function AddParticipantDialog({
  open,
  onOpenChange,
  courseId,
  enrolledIds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  enrolledIds: string[];
  onSaved: () => void;
}) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[] | null>(null);
  const [userId, setUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setUserId("");
      api<{ users: { id: string; name: string; email: string; isActive: boolean }[] }>("/api/users")
        .then((d) => setUsers(d.users.filter((u) => u.isActive && !enrolledIds.includes(u.id))))
        .catch(() => setUsers([]));
    }
  }, [open, enrolledIds]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    try {
      await api(`/api/courses/${courseId}/enrollments`, {
        method: "POST",
        body: JSON.stringify({ userId, action: "ADD" }),
      });
      toast.success("Participant added.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the participant.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add participant</DialogTitle>
          <DialogDescription>Enroll an employee in this course.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={users === null ? "Loading…" : "Pick a person"} />
              </SelectTrigger>
              <SelectContent>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!userId || submitting}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- Sessions & attendance ---------------------------- */

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localTodayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function SessionsTab({
  courseId,
  sessions,
  participants,
  canManage,
  meId,
  onChanged,
}: {
  courseId: string;
  sessions: SessionDto[];
  participants: Participant[];
  canManage: boolean;
  meId: string;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [marking, setMarking] = useState<SessionDto | null>(null);
  const today = localTodayKey();
  const meEnrolled = participants.some((p) => p.id === meId);

  async function markAttendance(sessionId: string, userId: string, status: string) {
    try {
      await api(`/api/courses/${courseId}/attendance`, {
        method: "POST",
        body: JSON.stringify({ sessionId, userId, status }),
      });
      toast.success("Attendance saved.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save attendance.");
    }
  }

  async function deleteSession(sessionId: string) {
    if (!window.confirm("Delete this session and its attendance records?")) return;
    try {
      await api(`/api/courses/${courseId}/sessions?sessionId=${sessionId}`, { method: "DELETE" });
      toast.success("Session deleted.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the session.");
    }
  }

  const ordered = [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Classes & attendance</CardTitle>
          <CardDescription>Recurring class sessions for this course.</CardDescription>
        </div>
        {canManage && <Button size="sm" onClick={() => setAddOpen(true)}><CalendarPlus className="h-4 w-4" /> Add sessions</Button>}
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No class sessions scheduled yet.</p>
        ) : (
          <div className="space-y-2">
            {ordered.map((s) => {
              const present = s.attendance.filter((a) => a.status === "PRESENT").length;
              const mine = s.attendance.find((a) => a.userId === meId);
              const isToday = s.date.slice(0, 10) === today;
              return (
                <div key={s.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3", isToday && "border-primary/60 bg-primary/5")}>
                  <div className="w-28">
                    <p className="text-sm font-medium">{formatKey(s.date.slice(0, 10), false)}</p>
                    {isToday && <p className="text-[10px] font-medium text-primary">Today</p>}
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{s.topic ?? "Class session"}</p>
                  <Badge variant="outline" className="border-emerald-500/50 text-emerald-600">
                    {present}/{participants.length} present
                  </Badge>
                  {meEnrolled && (isToday || canManage) && (
                    <div className="flex gap-1">
                      {["PRESENT", "ABSENT", "EXCUSED"].map((st) => (
                        <Button
                          key={st}
                          size="sm"
                          variant={mine?.status === st ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => markAttendance(s.id, meId, st)}
                        >
                          {COURSE_ATTENDANCE_LABEL[st]}
                        </Button>
                      ))}
                    </div>
                  )}
                  {canManage && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setMarking(s)}>
                        Mark all
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:text-rose-600" onClick={() => deleteSession(s.id)} aria-label="Delete session">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {canManage && marking && (
        <Dialog open onOpenChange={(open) => !open && setMarking(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mark attendance</DialogTitle>
              <DialogDescription>{formatKey(marking.date.slice(0, 10))} — {marking.topic ?? "Class session"}</DialogDescription>
            </DialogHeader>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {participants.map((p) => {
                const current = marking.attendance.find((a) => a.userId === p.id)?.status;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <span className="truncate text-sm">{p.name}</span>
                    <div className="flex gap-1">
                      {["PRESENT", "ABSENT", "EXCUSED"].map((st) => (
                        <Button
                          key={st}
                          size="sm"
                          variant={current === st ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            void markAttendance(marking.id, p.id, st);
                            setMarking({
                              ...marking,
                              attendance: [
                                ...marking.attendance.filter((a) => a.userId !== p.id),
                                { userId: p.id, status: st },
                              ],
                            });
                          }}
                        >
                          {COURSE_ATTENDANCE_LABEL[st]}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {canManage && (
        <AddSessionsDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          courseId={courseId}
          onSaved={() => {
            setAddOpen(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function AddSessionsDialog({
  open,
  onOpenChange,
  courseId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  onSaved: () => void;
}) {
  const nextMonday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [startDate, setStartDate] = useState(nextMonday);
  const [weeks, setWeeks] = useState("4");
  const [weekdays, setWeekdays] = useState<number[]>([1, 3]);
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dates = useMemo(() => {
    const nWeeks = Math.max(1, Math.min(26, Number(weeks) || 1));
    const out: string[] = [];
    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return out;
    for (let w = 0; w < nWeeks; w++) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const d = new Date(start);
        d.setDate(start.getDate() + w * 7 + dayOffset);
        if (weekdays.includes(d.getDay())) {
          out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }
      }
    }
    return out.slice(0, 100);
  }, [startDate, weeks, weekdays]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await api<{ message: string }>(`/api/courses/${courseId}/sessions`, {
        method: "POST",
        body: JSON.stringify({ dates, topic: topic || undefined }),
      });
      toast.success(result.message);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add sessions.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add class sessions</DialogTitle>
          <DialogDescription>Generate recurring dates or add a one-off class.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sess-start">Starting from</Label>
              <Input id="sess-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sess-weeks">Weeks</Label>
              <Input id="sess-weeks" type="number" min={1} max={26} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Days of week</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_LABELS.map((label, idx) => (
                <label key={label} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={weekdays.includes(idx)}
                    onCheckedChange={(v) =>
                      setWeekdays((prev) => (v === true ? [...prev, idx] : prev.filter((d) => d !== idx)))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sess-topic">Topic (applies to all added dates)</Label>
            <Input id="sess-topic" placeholder="e.g. Module 2 review" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            {dates.length} session{dates.length === 1 ? "" : "s"} will be added{dates.length > 0 && `: ${formatKey(dates[0])} … ${formatKey(dates[dates.length - 1])}`}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={dates.length === 0 || submitting}>
              {submitting ? "Adding…" : "Add sessions"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Edit course ------------------------------- */

function EditCourseDialog({
  open,
  onOpenChange,
  course,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: CourseData["course"];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [attendanceEnabled, setAttendanceEnabled] = useState(false);
  const [scheduleNote, setScheduleNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(course.name);
      setDescription(course.description ?? "");
      setStartedOn(course.startedOn ? course.startedOn.slice(0, 10) : "");
      setAttendanceEnabled(course.attendanceEnabled);
      setScheduleNote(course.scheduleNote ?? "");
    }
  }, [open, course]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api(`/api/courses/${course.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description,
          startedOn: startedOn || null,
          attendanceEnabled,
          scheduleNote,
        }),
      });
      toast.success("Course updated.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the course.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit course</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-course-name">Name</Label>
            <Input id="edit-course-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-course-desc">Description</Label>
            <Textarea id="edit-course-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-course-start">Started on</Label>
              <Input id="edit-course-start" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
            </div>
            <div className="flex items-end space-x-2 pb-2">
              <Checkbox id="edit-course-att" checked={attendanceEnabled} onCheckedChange={(v) => setAttendanceEnabled(v === true)} />
              <Label htmlFor="edit-course-att" className="text-sm font-normal">Track class attendance</Label>
            </div>
          </div>
          {attendanceEnabled && (
            <div className="space-y-2">
              <Label htmlFor="edit-course-sched">Class schedule</Label>
              <Input id="edit-course-sched" placeholder="e.g. Mon & Wed, 10:00–11:30" value={scheduleNote} onChange={(e) => setScheduleNote(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
