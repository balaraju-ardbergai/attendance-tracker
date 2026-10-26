"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderKanban, Layers, Plus, Zap } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";
import { useUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type ProjectListItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  methodology: string;
  lead: { id: string; name: string; email: string; pictureUrl: string | null } | null;
  team: { id: string; name: string } | null;
  issueCount: number;
  completedCount: number;
  myOpenCount: number;
  avgProgress: number;
  sprintCount: number;
  phaseCount: number;
};

type IssueDto = {
  id: string;
  key: string | null;
  title: string;
  status: string;
  priority: string;
  progress: number;
  dueDate: string | null;
  project?: { id: string; name: string; key: string } | null;
};

export default function ProjectsPage() {
  const router = useRouter();
  const me = useUser();
  const canCreate = me?.role === "ADMIN" || me?.role === "DIRECTOR" || me?.isTeamLead;

  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [myIssues, setMyIssues] = useState<IssueDto[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([
        api<{ projects: ProjectListItem[] }>("/api/projects"),
        api<{ issues: IssueDto[] }>("/api/issues?scope=mine"),
      ]);
      setProjects(p.projects);
      setMyIssues(i.issues);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load projects.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchMyIssue(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/issues/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the issue.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="JIRA-style work tracking — agile sprints or waterfall phases, epics, story points and Jira IDs."
      >
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </Button>
        )}
      </PageHeader>

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="mine">My work</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-4">
          {!projects ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <FolderKanban className="h-8 w-8" />
                <p>No projects yet{canCreate ? " — create the first one." : "."}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => (
                <Card
                  key={p.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{p.name}</CardTitle>
                      <div className="flex shrink-0 gap-1">
                        <Badge variant="secondary" className="font-mono text-[10px]">{p.key}</Badge>
                        <Badge variant="outline" className="text-[10px]">{p.methodology}</Badge>
                      </div>
                    </div>
                    <CardDescription className="line-clamp-2">{p.description ?? "No description."}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{p.completedCount}/{p.issueCount} issues done</span>
                        <span className="font-medium text-foreground">{p.avgProgress}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.avgProgress}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {p.methodology === "SCRUM" ? <Zap className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                        {p.methodology === "SCRUM" ? `${p.sprintCount} sprint(s)` : `${p.phaseCount} phase(s)`}
                      </span>
                      {p.myOpenCount > 0 && (
                        <span className="font-medium text-primary">{p.myOpenCount} assigned to you</span>
                      )}
                      {p.lead && (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar className="h-5 w-5">
                            {p.lead.pictureUrl && <AvatarImage src={p.lead.pictureUrl} alt={p.lead.name} />}
                            <AvatarFallback className="text-[8px]">{initials(p.lead.name)}</AvatarFallback>
                          </Avatar>
                          {p.lead.name}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My open work</CardTitle>
              <CardDescription>Everything assigned to you across all projects.</CardDescription>
            </CardHeader>
            <CardContent>
              {!myIssues ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : myIssues.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nothing assigned to you. Enjoy!</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="hidden sm:table-cell">Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="min-w-32">Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myIssues.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.key ?? "—"}</TableCell>
                        <TableCell className="max-w-72">
                          <p className="truncate text-sm font-medium">{t.title}</p>
                          {t.project && <p className="text-xs text-muted-foreground">{t.project.name}</p>}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge
                            variant="outline"
                            className={cn(
                              t.priority === "HIGH"
                                ? "border-rose-500/50 text-rose-600"
                                : t.priority === "MEDIUM"
                                  ? "border-amber-500/50 text-amber-600"
                                  : "text-muted-foreground",
                            )}
                          >
                            {TASK_PRIORITY_LABEL[t.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select value={t.status} onValueChange={(v) => patchMyIssue(t.id, { status: v })}>
                            <SelectTrigger size="sm" className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED"].map((s) => (
                                <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn("h-full rounded-full", t.progress >= 100 ? "bg-emerald-500" : "bg-sky-500")}
                                style={{ width: `${t.progress}%` }}
                              />
                            </div>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={t.progress}
                              onBlur={(e) => {
                                const v = Math.max(0, Math.min(100, Number(e.target.value)));
                                if (Number.isFinite(v) && v !== t.progress) void patchMyIssue(t.id, { progress: v });
                              }}
                              className="h-7 w-14 text-xs"
                              aria-label="Progress"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {canCreate && <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={load} />}
    </div>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [methodology, setMethodology] = useState("SCRUM");
  const [teamId, setTeamId] = useState("NONE");
  const [leadId, setLeadId] = useState("NONE");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setKey("");
      setDescription("");
      setMethodology("SCRUM");
      setTeamId("NONE");
      setLeadId("NONE");
      api<{ teams: { id: string; name: string }[] }>("/api/teams").then((d) => setTeams(d.teams)).catch(() => {});
      api<{ users: { id: string; name: string; isActive: boolean }[] }>("/api/users")
        .then((d) => setUsers(d.users.filter((u) => u.isActive)))
        .catch(() => {});
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await api<{ message: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          key,
          description: description || undefined,
          methodology,
          teamId: teamId === "NONE" ? null : teamId,
          leadId: leadId === "NONE" ? null : leadId,
        }),
      });
      toast.success(data.message);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the project.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>The key becomes the prefix for Jira-style IDs (e.g. PRD-1).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Name</Label>
              <Input id="proj-name" placeholder="Product Engineering" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-key">Key</Label>
              <Input id="proj-key" placeholder="PRD" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} maxLength={10} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea id="proj-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
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
              <Label>Team (optional)</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No team</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Project lead / Scrum master (optional)</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No lead</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
