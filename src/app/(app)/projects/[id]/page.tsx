"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Play, Plus, SquareCheck, Trash2 } from "lucide-react";
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

const STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED"] as const;
const TYPES = ["STORY", "TASK", "BUG"] as const;

type Sprint = { id: string; name: string; goal: string | null; startDate: string | null; endDate: string | null; status: string; createdAt: string };
type Phase = { id: string; name: string; order: number; startDate: string | null; endDate: string | null };

type Issue = {
  id: string;
  key: string | null;
  seq: number | null;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  type: string;
  status: string;
  priority: string;
  progress: number;
  storyPoints: number | null;
  dueDate: string | null;
  epicId: string | null;
  sprintId: string | null;
  phaseId: string | null;
  assignee: { id: string; name: string; email: string; pictureUrl: string | null } | null;
  sprint: { id: string; name: string; status: string } | null;
  phase: { id: string; name: string; order: number } | null;
  epic: { id: string; key: string | null; title: string } | null;
};

type ProjectData = {
  project: { id: string; key: string; name: string; description: string | null; methodology: string; teamId: string | null; leadId: string | null };
  issues: Issue[];
  sprints: Sprint[];
  phases: Phase[];
  members: { id: string; name: string; email: string; pictureUrl: string | null; isActive: boolean }[] | null;
  canManage: boolean;
};

const priorityTone = (p: string) =>
  p === "HIGH" ? "border-rose-500/50 text-rose-600" : p === "MEDIUM" ? "border-amber-500/50 text-amber-600" : "text-muted-foreground";
const statusTone = (s: string) =>
  s === "COMPLETED" ? "border-emerald-500/50 text-emerald-600" : s === "IN_PROGRESS" || s === "IN_REVIEW" ? "border-amber-500/50 text-amber-600" : s === "BLOCKED" ? "border-rose-500/50 text-rose-600" : "text-muted-foreground";

export default function ProjectWorkspacePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const me = useUser();

  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Issue | null>(null);
  const [editProject, setEditProject] = useState(false);
  const [boardScope, setBoardScope] = useState<string>("active");
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<ProjectData>(`/api/projects/${projectId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the project.");
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>Project</CardTitle><CardDescription>{error}</CardDescription></CardHeader>
        <CardContent><Button asChild variant="outline"><Link href="/projects">Back to projects</Link></Button></CardContent>
      </Card>
    );
  }
  if (!data) {
    return <div className="space-y-4"><Skeleton className="h-9 w-72" /><Skeleton className="h-64 w-full" /></div>;
  }

  const { project, issues, sprints, phases, members, canManage } = data;
  const epics = issues.filter((i) => i.type === "EPIC");
  const workItems = issues.filter((i) => i.type !== "EPIC");
  const activeSprint = sprints.find((s) => s.status === "ACTIVE");
  const isScrum = project.methodology === "SCRUM";
  const boardIssues =
    isScrum && boardScope !== "all"
      ? workItems.filter((i) => i.sprintId === (boardScope === "active" ? activeSprint?.id : boardScope))
      : workItems;

  async function patchIssue(id: string, body: Record<string, unknown>, refresh = true) {
    try {
      await api(`/api/issues/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (refresh) await load();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the issue.");
      return false;
    }
  }

  async function moveIssue(id: string, status: string) {
    const issue = issues.find((i) => i.id === id);
    if (!issue || issue.status === status) return;
    const canDrag = canManage || issue.assignee?.id === me?.id;
    if (!canDrag) {
      toast.error("Only the assignee, the project lead, its team lead, HR or Directors can move this issue.");
      return;
    }
    // Optimistic update — the server keeps status/progress coherent.
    setData((prev) =>
      prev
        ? { ...prev, issues: prev.issues.map((i) => (i.id === id ? { ...i, status, progress: status === "COMPLETED" ? 100 : i.progress } : i)) }
        : prev,
    );
    const ok = await patchIssue(id, { status }, false);
    if (ok) await load();
  }

  async function deleteIssue(issue: Issue) {
    if (!window.confirm(`Delete ${issue.key ?? issue.title}?`)) return;
    try {
      await api(`/api/issues/${issue.id}`, { method: "DELETE" });
      toast.success("Issue deleted.");
      setDetail(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the issue.");
    }
  }

  async function deleteProject() {
    if (!window.confirm(`Delete project ${project.key} (“${project.name}”) and all its issues?`)) return;
    try {
      await api(`/api/projects/${projectId}`, { method: "DELETE" });
      toast.success("Project deleted.");
      router.push("/projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the project.");
    }
  }

  const epicProgress = (epicId: string) => {
    const children = workItems.filter((i) => i.epicId === epicId);
    return children.length ? Math.round(children.reduce((s, i) => s + i.progress, 0) / children.length) : 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/projects" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Projects
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <Badge variant="secondary" className="font-mono">{project.key}</Badge>
            <Badge variant="outline">{project.methodology}</Badge>
          </div>
          {project.description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New issue</Button>
          {canManage && (
            <Button variant="outline" size="icon" onClick={() => setEditProject(true)} aria-label="Project settings"><Pencil className="h-4 w-4" /></Button>
          )}
          {me?.role === "DIRECTOR" || me?.role === "ADMIN" ? (
            <Button variant="outline" size="icon" className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10" onClick={deleteProject} aria-label="Delete project">
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="backlog">
        <TabsList className="flex-wrap">
          <TabsTrigger value="backlog">Backlog</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
          {isScrum && <TabsTrigger value="sprints">Sprints {activeSprint ? `· ${activeSprint.name}` : ""}</TabsTrigger>}
          {!isScrum && <TabsTrigger value="phases">Phases</TabsTrigger>}
        </TabsList>

        {/* ------------------------------ BACKLOG ------------------------------ */}
        <TabsContent value="backlog" className="mt-4 space-y-4">
          {epics.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Epics</CardTitle><CardDescription>Progress is averaged from their issues.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {epics.map((e) => {
                  const pct = epicProgress(e.id);
                  return (
                    <button key={e.id} className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50" onClick={() => setDetail(e)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{e.key}</span>
                        <span className="text-sm font-semibold">{pct}%</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium">{e.title}</p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">All issues</CardTitle>
              <CardDescription>{workItems.length} issue(s) · story points total {workItems.reduce((s, i) => s + (i.storyPoints ?? 0), 0)}</CardDescription>
            </CardHeader>
            <CardContent>
              <IssueTable
                issues={workItems}
                sprints={sprints}
                phases={phases}
                canManage={canManage}
                isScrum={isScrum}
                onOpen={setDetail}
                onPatch={patchIssue}
                onDelete={deleteIssue}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------- BOARD ------------------------------- */}
        <TabsContent value="board" className="mt-4 space-y-3">
          {isScrum && (
            <div className="flex items-center gap-2">
              <Select value={boardScope} onValueChange={setBoardScope}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" disabled={!activeSprint}>
                    {activeSprint ? `Active: ${activeSprint.name}` : "No active sprint"}
                  </SelectItem>
                  {sprints.filter((s) => s.id !== activeSprint?.id).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.status})</SelectItem>
                  ))}
                  <SelectItem value="all">All issues</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Drag cards between columns to change status.</p>
            </div>
          )}
          {!isScrum && (
            <p className="text-xs text-muted-foreground">Drag cards between columns to change status.</p>
          )}
          {isScrum && boardScope === "active" && !activeSprint ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No active sprint. Start one from the Sprints tab{canManage ? "" : " (your lead or HR can)"}.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              {STATUSES.map((status) => {
                const columnIssues = boardIssues.filter((i) => i.status === status);
                const canDrop = boardIssues.length > 0;
                return (
                  <Card
                    key={status}
                    className={cn(
                      "bg-muted/30 transition-colors",
                      dragOverColumn === status && canDrop && "border-primary bg-accent/60 ring-2 ring-primary/30",
                    )}
                    onDragOver={(e) => {
                      if (!canDrop) return;
                      e.preventDefault();
                      setDragOverColumn(status);
                    }}
                    onDragLeave={() => setDragOverColumn((prev) => (prev === status ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverColumn(null);
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) void moveIssue(id, status);
                    }}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {TASK_STATUS_LABEL[status]}
                        <span>{columnIssues.length}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="min-h-24 space-y-2">
                      {columnIssues.map((i) => {
                        const canDrag = canManage || i.assignee?.id === me?.id;
                        return (
                          <div
                            key={i.id}
                            draggable={canDrag}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", i.id);
                              e.dataTransfer.effectAllowed = "move";
                              setDraggingId(i.id);
                            }}
                            onDragEnd={() => setDraggingId(null)}
                            onClick={() => setDetail(i)}
                            className={cn(
                              "w-full cursor-pointer rounded-lg border bg-card p-2.5 text-left transition-shadow hover:shadow-md",
                              canDrag ? "cursor-grab active:cursor-grabbing" : "opacity-80",
                              draggingId === i.id && "opacity-40",
                            )}
                            title={canDrag ? "Drag to change status" : undefined}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-[10px] text-muted-foreground">{i.key}</span>
                              {i.storyPoints != null && <Badge variant="secondary" className="px-1.5 text-[10px]">{i.storyPoints} pts</Badge>}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-sm font-medium">{i.title}</p>
                            <div className="mt-2 flex items-center justify-between">
                              {i.assignee ? (
                                <Avatar className="h-5 w-5">
                                  {i.assignee.pictureUrl && <AvatarImage src={i.assignee.pictureUrl} alt={i.assignee.name} />}
                                  <AvatarFallback className="text-[8px]">{initials(i.assignee.name)}</AvatarFallback>
                                </Avatar>
                              ) : <span className="text-[10px] text-muted-foreground">Unassigned</span>}
                              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-sky-500" style={{ width: `${i.progress}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {columnIssues.length === 0 && <p className="py-4 text-center text-[11px] text-muted-foreground">Drop here</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------ SPRINTS ------------------------------ */}
        {isScrum && (
          <TabsContent value="sprints" className="mt-4 space-y-4">
            <SprintList
              sprints={sprints}
              issues={workItems}
              canManage={canManage}
              onChanged={load}
              projectId={projectId}
            />
          </TabsContent>
        )}

        {/* ------------------------------- PHASES ------------------------------ */}
        {!isScrum && (
          <TabsContent value="phases" className="mt-4 space-y-4">
            <PhaseList
              phases={phases}
              issues={workItems}
              canManage={canManage}
              onChanged={load}
              projectId={projectId}
            />
          </TabsContent>
        )}
      </Tabs>

      {createOpen && (
        <IssueDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          projectId={projectId}
          projectKey={project.key}
          methodology={project.methodology}
          sprints={sprints}
          phases={phases}
          epics={epics}
          members={members}
          teamId={project.teamId}
          issue={null}
          onSaved={async () => {
            setCreateOpen(false);
            await load();
          }}
        />
      )}

      {detail && (
        <IssueDialog
          open
          onOpenChange={(open) => !open && setDetail(null)}
          projectId={projectId}
          projectKey={project.key}
          methodology={project.methodology}
          sprints={sprints}
          phases={phases}
          epics={epics}
          members={members}
          teamId={project.teamId}
          issue={detail}
          canManage={canManage}
          meId={me?.id ?? ""}
          onSaved={async () => {
            setDetail(null);
            await load();
          }}
          onChanged={load}
          onDelete={() => deleteIssue(detail)}
        />
      )}

      {editProject && (
        <ProjectSettingsDialog
          open
          onOpenChange={(open) => !open && setEditProject(false)}
          project={project}
          onSaved={async () => {
            setEditProject(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- Issue table --------------------------------- */

function IssueTable({
  issues, sprints, phases, canManage, isScrum, onOpen, onPatch, onDelete,
}: {
  issues: Issue[];
  sprints: Sprint[];
  phases: Phase[];
  canManage: boolean;
  isScrum: boolean;
  onOpen: (issue: Issue) => void;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (issue: Issue) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Key</TableHead>
          <TableHead>Title</TableHead>
          <TableHead className="hidden lg:table-cell">{isScrum ? "Sprint" : "Phase"}</TableHead>
          <TableHead className="hidden xl:table-cell">Epic</TableHead>
          <TableHead className="hidden md:table-cell">Assignee</TableHead>
          <TableHead className="hidden sm:table-cell">Pts</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="min-w-28">Progress</TableHead>
          <TableHead className="text-right">·</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.length === 0 && (
          <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No issues yet.</TableCell></TableRow>
        )}
        {issues.map((i) => (
          <TableRow key={i.id} className="cursor-pointer" onClick={() => onOpen(i)}>
            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{i.key ?? "—"}</TableCell>
            <TableCell className="max-w-72">
              <p className="truncate text-sm font-medium">
                <Badge variant="outline" className="mr-1.5 text-[9px] uppercase">{i.type}</Badge>
                {i.title}
              </p>
            </TableCell>
            <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
              {(isScrum ? i.sprint?.name : i.phase?.name) ?? "Backlog"}
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground xl:table-cell">{i.epic?.key ?? "—"}</TableCell>
            <TableCell className="hidden md:table-cell">
              {i.assignee ? (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <Avatar className="h-5 w-5">
                    {i.assignee.pictureUrl && <AvatarImage src={i.assignee.pictureUrl} alt={i.assignee.name} />}
                    <AvatarFallback className="text-[8px]">{initials(i.assignee.name)}</AvatarFallback>
                  </Avatar>
                  {i.assignee.name}
                </span>
              ) : <span className="text-sm text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className="text-sm">{i.storyPoints ?? "—"}</TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              {canManage || i.assignee ? (
                <Select value={i.status} onValueChange={(v) => onPatch(i.id, { status: v })}>
                  <SelectTrigger size="sm" className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className={statusTone(i.status)}>{TASK_STATUS_LABEL[i.status]}</Badge>
              )}
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", i.progress >= 100 ? "bg-emerald-500" : "bg-sky-500")} style={{ width: `${i.progress}%` }} />
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={i.progress}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value)));
                    if (Number.isFinite(v) && v !== i.progress) onPatch(i.id, { progress: v });
                  }}
                  className="h-7 w-14 text-xs"
                  aria-label="Progress"
                />
              </div>
            </TableCell>
            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
              {canManage && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:text-rose-600" onClick={() => onDelete(i)} aria-label="Delete issue">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* --------------------------------- Sprint list --------------------------------- */

function SprintList({
  sprints, issues, canManage, onChanged, projectId,
}: {
  sprints: Sprint[];
  issues: Issue[];
  canManage: boolean;
  onChanged: () => void;
  projectId: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);

  async function sprintAction(id: string, action: "START" | "COMPLETE" | "DELETE", name: string) {
    if (action === "DELETE" && !window.confirm(`Delete sprint “${name}”? Its issues return to the backlog.`)) return;
    try {
      const data = await api<{ message: string }>(`/api/sprints/${id}`, action === "DELETE" ? { method: "DELETE" } : { method: "PATCH", body: JSON.stringify({ action }) });
      toast.success(data.message);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the sprint.");
    }
  }

  const ordered = [...sprints].sort((a, b) => (a.status === "ACTIVE" ? -1 : b.status === "ACTIVE" ? 1 : b.createdAt?.localeCompare?.(a.createdAt ?? "") ?? 0));

  return (
    <>
      <div className="flex justify-end">
        {canManage && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New sprint</Button>}
      </div>
      {ordered.length === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No sprints yet.</CardContent></Card>
      )}
      {ordered.map((s) => {
        const sprintIssues = issues.filter((i) => i.sprintId === s.id);
        const points = sprintIssues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
        const done = sprintIssues.filter((i) => i.status === "COMPLETED").length;
        return (
          <Card key={s.id} className={cn(s.status === "ACTIVE" && "border-primary/50")}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {s.name}
                  <Badge variant={s.status === "ACTIVE" ? "default" : "outline"}>{s.status}</Badge>
                </CardTitle>
                {s.goal && <CardDescription>{s.goal}</CardDescription>}
                <CardDescription>
                  {s.startDate ? `${formatKey(s.startDate.slice(0, 10))} → ${s.endDate ? formatKey(s.endDate.slice(0, 10)) : "open"}` : "No dates set"}
                  {" · "}{done}/{sprintIssues.length} done · {points} pts
                </CardDescription>
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  {s.status === "PLANNED" && (
                    <Button size="sm" variant="outline" onClick={() => sprintAction(s.id, "START", s.name)}><Play className="h-3.5 w-3.5" /> Start</Button>
                  )}
                  {s.status === "ACTIVE" && (
                    <Button size="sm" variant="outline" onClick={() => sprintAction(s.id, "COMPLETE", s.name)}><SquareCheck className="h-3.5 w-3.5" /> Complete</Button>
                  )}
                  {s.status !== "ACTIVE" && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:text-rose-600" onClick={() => sprintAction(s.id, "DELETE", s.name)} aria-label="Delete sprint">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </CardHeader>
            {sprintIssues.length > 0 && (
              <CardContent className="flex flex-wrap gap-1.5">
                {sprintIssues.map((i) => (
                  <span key={i.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                    <span className="font-mono text-[10px] text-muted-foreground">{i.key}</span>
                    <span className="max-w-40 truncate">{i.title}</span>
                  </span>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
      {canManage && (
        <SprintDialog open={createOpen} onOpenChange={setCreateOpen} projectId={projectId} onSaved={() => { setCreateOpen(false); onChanged(); }} />
      )}
    </>
  );
}

function SprintDialog({
  open, onOpenChange, projectId, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setGoal(""); setStartDate(""); setEndDate(""); }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api(`/api/projects/${projectId}/sprints`, {
        method: "POST",
        body: JSON.stringify({ name, goal: goal || undefined, startDate: startDate || undefined, endDate: endDate || undefined }),
      });
      toast.success("Sprint created.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the sprint.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New sprint</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="sp-name">Name</Label><Input id="sp-name" placeholder="Sprint 3" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="sp-goal">Sprint goal</Label><Input id="sp-goal" placeholder="Ship the reporting MVP" value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="sp-start">Starts</Label><Input id="sp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="sp-end">Ends</Label><Input id="sp-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create sprint"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Phase list --------------------------------- */

function PhaseList({
  phases, issues, canManage, onChanged, projectId,
}: {
  phases: Phase[];
  issues: Issue[];
  canManage: boolean;
  onChanged: () => void;
  projectId: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);

  async function phaseAction(id: string, action: "MOVE_UP" | "MOVE_DOWN" | "DELETE", name: string) {
    if (action === "DELETE" && !window.confirm(`Delete phase “${name}”? Its issues become unphased.`)) return;
    try {
      const data =
        action === "DELETE"
          ? await api<{ message: string }>(`/api/phases/${id}`, { method: "DELETE" })
          : await api<{ message: string }>(`/api/phases/${id}`, { method: "PATCH", body: JSON.stringify({ direction: action === "MOVE_UP" ? "up" : "down" }) });
      toast.success(data.message);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the phase.");
    }
  }

  return (
    <>
      <div className="flex justify-end">
        {canManage && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New phase</Button>}
      </div>
      {phases.length === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No phases yet. Waterfall projects track work in sequential phases.</CardContent></Card>
      )}
      {phases.map((p, idx) => {
        const phaseIssues = issues.filter((i) => i.phaseId === p.id);
        const pct = phaseIssues.length ? Math.round(phaseIssues.reduce((s, i) => s + i.progress, 0) / phaseIssues.length) : 0;
        return (
          <Card key={p.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Phase {p.order}: {p.name}</CardTitle>
                <CardDescription>
                  {p.startDate ? `${formatKey(p.startDate.slice(0, 10))} → ${p.endDate ? formatKey(p.endDate.slice(0, 10)) : "open"}` : "No dates"}
                  {" · "}{phaseIssues.length} issue(s)
                </CardDescription>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={idx === 0} onClick={() => phaseAction(p.id, "MOVE_UP", p.name)}>Up</Button>
                  <Button size="sm" variant="outline" disabled={idx === phases.length - 1} onClick={() => phaseAction(p.id, "MOVE_DOWN", p.name)}>Down</Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:text-rose-600"
                    onClick={() => phaseAction(p.id, "DELETE", p.name)}
                    aria-label="Delete phase"><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-semibold">{pct}%</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {canManage && (
        <PhaseDialog open={createOpen} onOpenChange={setCreateOpen} projectId={projectId} onSaved={() => { setCreateOpen(false); onChanged(); }} />
      )}
    </>
  );
}

function PhaseDialog({
  open, onOpenChange, projectId, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (open) setName(""); }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api(`/api/projects/${projectId}/phases`, { method: "POST", body: JSON.stringify({ name }) });
      toast.success("Phase created.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the phase.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New phase</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="ph-name">Phase name</Label><Input id="ph-name" placeholder="Requirements & Design" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create phase"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Issue dialog --------------------------------- */

function IssueDialog({
  open, onOpenChange, projectId, projectKey, methodology, sprints, phases, epics, members, teamId, issue, canManage, meId, onSaved, onChanged, onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectKey: string;
  methodology: string;
  sprints: Sprint[];
  phases: Phase[];
  epics: Issue[];
  members: { id: string; name: string; email: string; pictureUrl: string | null; isActive: boolean }[] | null;
  teamId: string | null;
  issue: Issue | null;
  canManage?: boolean;
  meId?: string;
  onSaved: () => void;
  onChanged?: () => void;
  onDelete?: () => void;
}) {
  const isEdit = issue !== null;
  const manage = canManage ?? true; // creating issues requires manage permission already checked server-side
  const canEditWork = manage || issue?.assignee?.id === meId;

  const [type, setType] = useState("TASK");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("NONE");
  const [sprintId, setSprintId] = useState("NONE");
  const [phaseId, setPhaseId] = useState("NONE");
  const [epicId, setEpicId] = useState("NONE");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [liveStatus, setLiveStatus] = useState("TODO");
  const [liveProgress, setLiveProgress] = useState(0);

  useEffect(() => {
    if (open) {
      setLiveStatus(issue?.status ?? "TODO");
      setLiveProgress(issue?.progress ?? 0);
    }
  }, [open, issue]);

  useEffect(() => {
    if (open) {
      setType(issue?.type === "EPIC" ? "EPIC" : issue?.type ?? "TASK");
      setTitle(issue?.title ?? "");
      setDescription(issue?.description ?? "");
      setAcceptanceCriteria(issue?.acceptanceCriteria ?? "");
      setStoryPoints(issue?.storyPoints != null ? String(issue.storyPoints) : "");
      setPriority(issue?.priority ?? "MEDIUM");
      setAssigneeId(issue?.assignee?.id ?? "NONE");
      setSprintId(issue?.sprintId ?? "NONE");
      setPhaseId(issue?.phaseId ?? "NONE");
      setEpicId(issue?.epicId ?? "NONE");
      setDueDate(issue?.dueDate ?? "");
    }
  }, [open, issue]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isEdit) {
        const body: Record<string, unknown> = { status: liveStatus };
        if (canEditWork) {
          Object.assign(body, {
            ...(manage ? {
              title, description, acceptanceCriteria: acceptanceCriteria || null,
              storyPoints: storyPoints ? Number(storyPoints) : null,
              priority, type,
              assigneeId: assigneeId === "NONE" ? null : assigneeId,
              sprintId: sprintId === "NONE" ? null : sprintId,
              phaseId: phaseId === "NONE" ? null : phaseId,
              epicId: epicId === "NONE" ? null : epicId,
              dueDate: dueDate || null,
            } : {}),
          });
        }
        await api(`/api/issues/${issue!.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Issue updated.");
      } else {
        await api("/api/issues", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            title, type, description: description || undefined,
            acceptanceCriteria: acceptanceCriteria || undefined,
            storyPoints: storyPoints ? Number(storyPoints) : null,
            priority,
            assigneeId: assigneeId === "NONE" ? null : assigneeId,
            sprintId: sprintId === "NONE" ? null : sprintId,
            phaseId: phaseId === "NONE" ? null : phaseId,
            epicId: epicId === "NONE" ? null : epicId,
            dueDate: dueDate || null,
          }),
        });
        toast.success("Issue created.");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the issue.");
    } finally {
      setSubmitting(false);
    }
  }

  const assigneeOptions = members ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `${issue!.key ?? ""} — ${issue!.title}` : `New issue in ${projectKey}`}</DialogTitle>
          <DialogDescription>{isEdit ? "Update the work item." : "Stories, tasks and bugs; create epics with type = Epic."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType} disabled={!manage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(isEdit ? ["EPIC", "STORY", "TASK", "BUG"] : ["EPIC", ...TYPES]).map((t) => (
                    <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="is-title">Title</Label>
              <Input id="is-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!manage} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="is-desc">Description</Label>
            <Textarea id="is-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!manage} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="is-ac">Acceptance criteria</Label>
            <Textarea id="is-ac" rows={2} placeholder="Given / when / then …" value={acceptanceCriteria} onChange={(e) => setAcceptanceCriteria(e.target.value)} disabled={!manage} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={!manage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Unassigned</SelectItem>
                  {assigneeOptions.filter((m) => m.isActive).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority} disabled={!manage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => <SelectItem key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="is-points">Story points</Label>
              <Input id="is-points" type="number" min={0} max={100} value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)} disabled={!manage} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {methodology === "SCRUM" ? (
              <div className="space-y-2">
                <Label>Sprint</Label>
                <Select value={sprintId} onValueChange={setSprintId} disabled={!manage}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Backlog</SelectItem>
                    {sprints.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.status})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Phase</Label>
                <Select value={phaseId} onValueChange={setPhaseId} disabled={!manage}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No phase</SelectItem>
                    {phases.map((p) => <SelectItem key={p.id} value={p.id}>Phase {p.order}: {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Epic</Label>
              <Select value={epicId} onValueChange={setEpicId} disabled={!manage}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No epic</SelectItem>
                  {epics.map((e) => <SelectItem key={e.id} value={e.id}>{e.key} — {e.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="is-due">Due date</Label>
              <Input id="is-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!manage} />
            </div>
          </div>
          {isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={liveStatus}
                  onValueChange={(v) => {
                    setLiveStatus(v);
                    void api(`/api/issues/${issue!.id}`, { method: "PATCH", body: JSON.stringify({ status: v }) })
                      .then(() => onChanged?.())
                      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not update the status."));
                  }}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="is-progress">Progress %</Label>
                <Input
                  id="is-progress"
                  type="number"
                  min={0}
                  max={100}
                  value={liveProgress}
                  onChange={(e) => setLiveProgress(Math.max(0, Math.min(100, Number(e.target.value))))}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value)));
                    if (Number.isFinite(v) && v !== issue!.progress) {
                      void api(`/api/issues/${issue!.id}`, { method: "PATCH", body: JSON.stringify({ progress: v }) })
                        .then(() => onChanged?.())
                        .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not update progress."));
                    }
                  }}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-row items-center justify-between">
            {isEdit && onDelete && manage ? (
              <Button type="button" variant="ghost" className="text-rose-600 hover:text-rose-600" onClick={onDelete}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              {(isEdit ? canEditWork : true) && (
                <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : isEdit ? "Save changes" : "Create issue"}</Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Project settings ------------------------------ */

function ProjectSettingsDialog({
  open, onOpenChange, project, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectData["project"];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [methodology, setMethodology] = useState("SCRUM");
  const [leadId, setLeadId] = useState("NONE");
  const [users, setUsers] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project.name);
      setDescription(project.description ?? "");
      setMethodology(project.methodology);
      setLeadId(project.leadId ?? "NONE");
      api<{ users: { id: string; name: string; isActive: boolean }[] }>("/api/users")
        .then((d) => setUsers(d.users.filter((u) => u.isActive)))
        .catch(() => {});
    }
  }, [open, project]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description, methodology, leadId: leadId === "NONE" ? null : leadId }),
      });
      toast.success("Project updated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the project.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Project settings</DialogTitle><DialogDescription>{project.key}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="ps-name">Name</Label><Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="ps-desc">Description</Label><Textarea id="ps-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Methodology</Label>
              <Select value={methodology} onValueChange={setMethodology}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCRUM">Scrum (sprints)</SelectItem>
                  <SelectItem value="WATERFALL">Waterfall (phases)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lead / Scrum master</Label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No lead</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
