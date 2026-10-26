"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ListTodo, Plus, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { formatKey } from "@/lib/dates";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

const STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  progress: number;
  assigneeId: string | null;
  assignee: { id: string; name: string; email: string; pictureUrl: string | null } | null;
  teamId: string | null;
  team: { id: string; name: string } | null;
  dueDate: string | null;
};

type UserDto = { id: string; name: string; email: string; isActive: boolean };
type TeamDto = { id: string; name: string };

const priorityTone = (p: string) =>
  p === "HIGH" ? "border-rose-500/50 text-rose-600" : p === "MEDIUM" ? "border-amber-500/50 text-amber-600" : "text-muted-foreground";

const statusTone = (s: string) =>
  s === "COMPLETED" ? "border-emerald-500/50 text-emerald-600" : s === "IN_PROGRESS" ? "border-amber-500/50 text-amber-600" : "text-muted-foreground";

export default function TasksPage() {
  const me = useUser();
  const isManager = me?.role === "ADMIN" || me?.role === "DIRECTOR";

  const [mine, setMine] = useState<TaskDto[] | null>(null);
  const [all, setAll] = useState<TaskDto[] | null>(null);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [teams, setTeams] = useState<TeamDto[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mineRes, allRes] = await Promise.all([
        api<{ tasks: TaskDto[] }>("/api/tasks"),
        isManager ? api<{ tasks: TaskDto[] }>("/api/tasks?scope=all") : Promise.resolve({ tasks: [] }),
      ]);
      setMine(mineRes.tasks);
      setAll(allRes.tasks);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load tasks.");
    }
  }, [isManager]);

  useEffect(() => {
    void load();
    api<{ users: UserDto[] }>("/api/users").then((d) => setUsers(d.users.filter((u) => u.isActive))).catch(() => {});
    api<{ teams: TeamDto[] }>("/api/teams").then((d) => setTeams(d.teams)).catch(() => {});
  }, [load]);

  async function patchTask(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the task.");
    }
  }

  async function removeTask(id: string, title: string) {
    if (!window.confirm(`Delete task “${title}”?`)) return;
    try {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
      toast.success("Task deleted.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the task.");
    }
  }

  function ProgressSummary({ tasks }: { tasks: TaskDto[] }) {
    const byAssignee = new Map<string, { name: string; pictureUrl: string | null; done: number; total: number; pct: number }>();
    for (const t of tasks) {
      const key = t.assignee?.id ?? "unassigned";
      const agg = byAssignee.get(key) ?? { name: t.assignee?.name ?? "Unassigned", pictureUrl: t.assignee?.pictureUrl ?? null, done: 0, total: 0, pct: 0 };
      agg.total++;
      agg.pct += t.progress;
      if (t.status === "COMPLETED") agg.done++;
      byAssignee.set(key, agg);
    }
    const rows = [...byAssignee.entries()].sort((a, b) => b[1].done - a[1].done);
    return (
      <div className="flex flex-wrap gap-2">
        {rows.map(([id, a]) => (
          <div key={id} className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3">
            <Avatar className="h-6 w-6">
              {a.pictureUrl && <AvatarImage src={a.pictureUrl} alt={a.name} />}
              <AvatarFallback className="text-[9px]">{initials(a.name)}</AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium">{a.name}</span>
            <span className="text-xs text-muted-foreground">{a.done}/{a.total} done</span>
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${a.total ? Math.round(a.pct / a.total) : 0}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 && <span className="text-sm text-muted-foreground">No tasks yet.</span>}
      </div>
    );
  }

  const TaskTable = ({ tasks, showAssignee }: { tasks: TaskDto[] | null; showAssignee: boolean }) => (
    <Card>
      <CardContent className="pt-6">
        {!tasks ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : tasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {showAssignee ? "No tasks in the organization yet." : "You have no tasks assigned. Enjoy the calm!"}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                {showAssignee && <TableHead>Assignee</TableHead>}
                <TableHead className="hidden md:table-cell">Team</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="hidden sm:table-cell">Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-36">Progress</TableHead>
                {isManager && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => {
                const canEdit = isManager || t.assigneeId === me?.id;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-64">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      {t.description && <p className="truncate text-xs text-muted-foreground">{t.description}</p>}
                    </TableCell>
                    {showAssignee && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {t.assignee?.pictureUrl && <AvatarImage src={t.assignee.pictureUrl} alt={t.assignee.name} />}
                            <AvatarFallback className="text-[9px]">{initials(t.assignee?.name ?? "?")}</AvatarFallback>
                          </Avatar>
                          <span className="truncate text-sm">{t.assignee?.name ?? "Unassigned"}</span>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{t.team?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={priorityTone(t.priority)}>{TASK_PRIORITY_LABEL[t.priority]}</Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground sm:table-cell">
                      {t.dueDate ? formatKey(t.dueDate.slice(0, 10), false) : "—"}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Select value={t.status} onValueChange={(v) => patchTask(t.id, { status: v })}>
                          <SelectTrigger size="sm" className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={statusTone(t.status)}>{TASK_STATUS_LABEL[t.status]}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full", t.progress >= 100 ? "bg-emerald-500" : "bg-sky-500")}
                            style={{ width: `${t.progress}%` }}
                          />
                        </div>
                        {canEdit ? (
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={t.progress}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(100, Number(e.target.value)));
                              if (Number.isFinite(v)) void patchTask(t.id, { progress: v, ...(v === 100 ? { status: "COMPLETED" } : {}), ...(v > 0 && v < 100 ? { status: "IN_PROGRESS" } : {}) });
                            }}
                            className="h-7 w-14 text-xs"
                            aria-label="Progress percent"
                          />
                        ) : (
                          <span className="w-9 text-right text-xs text-muted-foreground">{t.progress}%</span>
                        )}
                      </div>
                    </TableCell>
                    {isManager && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-600" onClick={() => removeTask(t.id, t.title)} aria-label="Delete task">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Task & Progress Tracker</h1>
          <p className="text-sm text-muted-foreground">Assign work, track status and progress per person.</p>
        </div>
        {isManager && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New task</Button>}
      </div>

      <Tabs defaultValue={isManager ? "all" : "mine"}>
        <TabsList>
          {isManager && <TabsTrigger value="all">All tasks</TabsTrigger>}
          <TabsTrigger value="mine">My tasks</TabsTrigger>
        </TabsList>

        {isManager && (
          <TabsContent value="all" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><ListTodo className="h-4 w-4" /> Progress by person</CardTitle>
                <CardDescription>Completed tasks and average progress per assignee</CardDescription>
              </CardHeader>
              <CardContent><ProgressSummary tasks={all ?? []} /></CardContent>
            </Card>
            <TaskTable tasks={all} showAssignee />
          </TabsContent>
        )}

        <TabsContent value="mine" className="mt-4">
          <TaskTable tasks={mine} showAssignee={false} />
        </TabsContent>
      </Tabs>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
        teams={teams}
        onSaved={() => {
          setCreateOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  users,
  teams,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserDto[];
  teams: TeamDto[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("NONE");
  const [teamId, setTeamId] = useState("NONE");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setAssigneeId("NONE");
      setTeamId("NONE");
      setDueDate("");
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: description || undefined,
          priority,
          assigneeId: assigneeId === "NONE" ? null : assigneeId,
          teamId: teamId === "NONE" ? null : teamId,
          dueDate: dueDate || null,
        }),
      });
      toast.success("Task created.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Assign it to someone — they can update the status and progress.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" placeholder="e.g. Set up the CI pipeline" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea id="task-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No team</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Due date (optional)</Label>
              <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create task"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
