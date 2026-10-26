"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, CalendarDays, GraduationCap, Plus, Users2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/components/user-context";
import { api } from "@/lib/client";
import { formatKey } from "@/lib/dates";

type CourseListItem = {
  id: string;
  name: string;
  description: string | null;
  startedOn: string | null;
  attendanceEnabled: boolean;
  scheduleNote: string | null;
  creator: { id: string; name: string };
  milestoneCount: number;
  participantCount: number;
  progressPercent: number;
};

export default function CoursesPage() {
  const router = useRouter();
  const user = useUser();
  const canManage = user?.role === "ADMIN" || user?.role === "DIRECTOR";

  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ courses: CourseListItem[] }>("/api/courses");
      setCourses(data.courses);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load courses.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Courses</h1>
          <p className="text-sm text-muted-foreground">
            Certification and training tracks with milestone progress for the org and each participant.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New course
          </Button>
        )}
      </div>

      {!courses ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <GraduationCap className="h-8 w-8" />
            <p>
              {canManage
                ? "No courses yet. Create the first one to start tracking."
                : "You are not enrolled in any courses yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Card
              key={course.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => router.push(`/courses/${course.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{course.name}</CardTitle>
                  {course.attendanceEnabled && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      <CalendarDays className="mr-1 h-3 w-3" /> Classes
                    </Badge>
                  )}
                </div>
                <CardDescription className="line-clamp-2">
                  {course.description ?? "No description."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Org progress</span>
                    <span className="font-medium text-foreground">{course.progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${course.progressPercent}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" /> {course.milestoneCount} milestones
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users2 className="h-3.5 w-3.5" /> {course.participantCount} participants
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {course.startedOn ? `Started ${formatKey(course.startedOn.slice(0, 10))}` : "No start date"}
                  {" · "}by {course.creator.name}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <CreateCourseDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
            setCreateOpen(false);
            router.push(`/courses/${id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateCourseDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [attendanceEnabled, setAttendanceEnabled] = useState(false);
  const [scheduleNote, setScheduleNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setStartedOn("");
      setAttendanceEnabled(false);
      setScheduleNote("");
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await api<{ course: { id: string }; message: string }>("/api/courses", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description || undefined,
          startedOn: startedOn || undefined,
          attendanceEnabled,
          scheduleNote: attendanceEnabled ? scheduleNote || undefined : undefined,
        }),
      });
      toast.success(data.message);
      onCreated(data.course.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the course.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
          <DialogDescription>
            Create a certification or training track, then add its milestones and participants.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="course-name">Course name</Label>
            <Input
              id="course-name"
              placeholder="Claude Certified Developer - Foundations"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-description">Description</Label>
            <Textarea
              id="course-description"
              placeholder="What this course covers…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="course-started">Started on (optional)</Label>
              <Input
                id="course-started"
                type="date"
                value={startedOn}
                onChange={(e) => setStartedOn(e.target.value)}
              />
            </div>
            <div className="flex items-end space-x-2 pb-2">
              <Checkbox
                id="course-attendance"
                checked={attendanceEnabled}
                onCheckedChange={(v) => setAttendanceEnabled(v === true)}
              />
              <Label htmlFor="course-attendance" className="text-sm font-normal">
                Track class attendance
              </Label>
            </div>
          </div>
          {attendanceEnabled && (
            <div className="space-y-2">
              <Label htmlFor="course-schedule">Class schedule</Label>
              <Input
                id="course-schedule"
                placeholder="e.g. Mon & Wed, 10:00–11:30 IST"
                value={scheduleNote}
                onChange={(e) => setScheduleNote(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
