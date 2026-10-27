"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Crown, IndianRupee, ListTodo, Trash2, UserMinus, UserPlus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { formatKey } from "@/lib/dates";
import { rupees } from "@/lib/money";
import { EXPENSE_CATEGORY_LABEL, ROLE_LABEL, TASK_STATUS_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  pictureUrl: string | null;
  isActive: boolean;
};

type TeamData = {
  team: { id: string; name: string; description: string | null; leadId: string | null; createdAt: string };
  members: Member[];
  taskStats: { total: number; todo: number; inProgress: number; completed: number };
  recentTasks: { id: string; title: string; status: string; progress: number; assignee: { id: string; name: string } | null; dueDate: string | null }[];
  expenseTotal: number;
  expenseThisMonth: number;
  recentExpenses: { id: string; title: string; amount: number; category: string; date: string }[];
};

type UserDto = { id: string; name: string; email: string; isActive: boolean };

export default function TeamDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const teamId = params.id;
  const me = useUser();
  const canManage = me?.role === "ADMIN" || me?.role === "DIRECTOR";

  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<TeamData>(`/api/teams/${teamId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the team.");
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeMember(userId: string, name: string) {
    try {
      const result = await api<{ message: string }>(`/api/teams/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId, action: "REMOVE" }),
      });
      toast.success(result.message);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the member.");
    }
  }

  async function setLead(userId: string | null) {
    try {
      await api(`/api/teams/${teamId}`, { method: "PATCH", body: JSON.stringify({ leadId: userId }) });
      toast.success(userId ? "Team lead updated." : "Team lead removed.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the lead.");
    }
  }

  async function deleteTeam() {
    if (!data || !window.confirm(`Delete team “${data.team.name}”?`)) return;
    try {
      await api(`/api/teams/${teamId}`, { method: "DELETE" });
      toast.success("Team deleted.");
      router.push("/teams");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the team.");
    }
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline"><Link href="/teams">Back to teams</Link></Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return <div className="space-y-4"><Skeleton className="h-9 w-56" /><Skeleton className="h-48 w-full" /></div>;
  }

  const { team, members, taskStats, recentTasks, expenseTotal, expenseThisMonth, recentExpenses } = data;
  const isLead = team.leadId === me?.id;
  const canManageNow = canManage || isLead;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/teams" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Teams
          </Link>
          <h1 className="text-2xl font-semibold">{team.name}</h1>
          {team.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{team.description}</p>}
        </div>
        {(canManageNow || isLead) && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Edit team</Button>
            {canManage && (
              <Button variant="outline" size="sm" className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10" onClick={deleteTeam}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Members" value={String(members.length)} />
        <StatCard label="Tasks" value={`${taskStats.completed}/${taskStats.total} done`} />
        <StatCard label="Spend (this month)" value={rupees(expenseThisMonth)} />
        <StatCard label="Spend (all time)" value={rupees(expenseTotal)} />
      </div>

      {/* Team graph — member grid */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Team members</CardTitle>
            <CardDescription>Click the crown on a member to make them the lead.</CardDescription>
          </div>
          {canManageNow && <Button size="sm" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add member</Button>}
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => {
                const isLead = team.leadId === m.id;
                return (
                  <div key={m.id} className={cn("flex items-center gap-3 rounded-lg border p-3", isLead && "border-amber-500/50 bg-amber-500/5")}>
                    <Avatar className="h-9 w-9">
                      {m.pictureUrl && <AvatarImage src={m.pictureUrl} alt={m.name} />}
                      <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-sm font-medium">
                        {m.name}
                        {isLead && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ?? m.role}
                        {m.department ? ` · ${m.department}` : ""}
                      </p>
                    </div>
                    {canManageNow && (
                      <div className="flex gap-1">
                        {!isLead && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Make lead" onClick={() => setLead(m.id)}>
                            <Crown className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:text-rose-600" title="Remove" onClick={() => removeMember(m.id, m.name)}>
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {(canManageNow || isLead) && <MemberDetailsSection teamId={teamId} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent tasks</CardTitle>
            <CardDescription>{taskStats.todo} to do · {taskStats.inProgress} in progress · {taskStats.completed} completed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentTasks.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No tasks for this team yet.</p>}
            {recentTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-md border p-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.assignee?.name ?? "Unassigned"}</span>
                <Badge variant="outline" className={cn(t.status === "COMPLETED" ? "border-emerald-500/50 text-emerald-600" : t.status === "IN_PROGRESS" ? "border-amber-500/50 text-amber-600" : "text-muted-foreground")}>
                  {TASK_STATUS_LABEL[t.status]}
                </Badge>
              </div>
            ))}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/projects">Open projects →</Link>
            </Button>
          </CardContent>
        </Card>

        {(canManage || me?.expenseAccess) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent team expenses</CardTitle>
            <CardDescription>Latest spends attributed to this team</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentExpenses.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No expenses recorded for this team.</p>}
            {recentExpenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-md border p-2.5 text-sm">
                <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{EXPENSE_CATEGORY_LABEL[e.category]} · {formatKey(e.date)}</span>
                <span className="font-semibold">{rupees(e.amount)}</span>
              </div>
            ))}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/expenses">Open expenses →</Link>
            </Button>
          </CardContent>
        </Card>
        )}
      </div>

      {canManageNow && (
        <AddMemberDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          teamId={teamId}
          memberIds={members.map((m) => m.id)}
          onSaved={async () => {
            setAddOpen(false);
            await load();
          }}
        />
      )}

      {canManageNow && (
        <EditTeamDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          teamId={teamId}
          team={{ name: team.name, description: team.description ?? "", leadId: team.leadId }}
          onSaved={async () => {
            setEditOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-lg font-semibold">{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function AddMemberDialog({
  open,
  onOpenChange,
  teamId,
  memberIds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  memberIds: string[];
  onSaved: () => void;
}) {
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [userId, setUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setUserId("");
      api<{ users: UserDto[] }>("/api/users")
        .then((d) => setUsers(d.users.filter((u) => u.isActive && !memberIds.includes(u.id))))
        .catch(() => setUsers([]));
    }
  }, [open, memberIds]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    try {
      await api(`/api/teams/${teamId}/members`, { method: "POST", body: JSON.stringify({ userId, action: "ADD" }) });
      toast.success("Member added.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full"><SelectValue placeholder={users === null ? "Loading…" : "Pick a person"} /></SelectTrigger>
              <SelectContent>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!userId || submitting}>Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTeamDialog({
  open,
  onOpenChange,
  teamId,
  team,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  team: { name: string; description: string; leadId: string | null };
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState("NONE");
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(team.name);
      setDescription(team.description);
      setLeadId(team.leadId ?? "NONE");
      api<{ users: UserDto[] }>("/api/users")
        .then((d) => setUsers(d.users.filter((u) => u.isActive)))
        .catch(() => setUsers([]));
    }
  }, [open, team]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api(`/api/teams/${teamId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description, leadId: leadId === "NONE" ? null : leadId }),
      });
      toast.success("Team updated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the team.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit team</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="et-name">Name</Label>
            <Input id="et-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="et-desc">Description</Label>
            <Textarea id="et-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Team lead</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No lead</SelectItem>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Member details ------------------------------ */

type OverviewMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  pictureUrl: string | null;
  attendance: { workingDays: number; present: number; leave: number; wfh: number; absent: number };
  pendingRequests: { type: string; startDate: string; endDate: string }[];
  openTasks: { id: string; key: string | null; title: string; status: string; progress: number; dueDate: string | null }[];
  courses: { name: string; percent: number }[];
};

function MemberDetailsSection({ teamId }: { teamId: string }) {
  const [members, setMembers] = useState<OverviewMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ members: OverviewMember[] }>(`/api/teams/${teamId}/overview`)
      .then((d) => setMembers(d.members))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load member details."));
  }, [teamId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Member details</CardTitle>
        <CardDescription>
          Attendance this month, pending requests, open tasks and course progress for everyone on this team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : !members ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : members.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Avatar className="h-8 w-8">
                    {m.pictureUrl && <AvatarImage src={m.pictureUrl} alt={m.name} />}
                    <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}{m.department ? ` · ${m.department}` : ""}</p>
                  </div>
                  <Badge variant="outline" className={cn(m.attendance.absent === 0 ? "border-emerald-500/50 text-emerald-600" : "border-amber-500/50 text-amber-600")}>
                    {m.attendance.present}/{m.attendance.workingDays} days present
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <p className="font-medium text-foreground">This month</p>
                    <p>{m.attendance.present} present · {m.attendance.leave} leave · {m.attendance.wfh} WFH · {m.attendance.absent} absent</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Pending requests</p>
                    {m.pendingRequests.length === 0 ? (
                      <p>None</p>
                    ) : (
                      m.pendingRequests.map((r, i) => (
                        <p key={i}>{r.type === "LEAVE" ? "Leave" : "WFH"}: {formatKey(r.startDate.slice(0, 10))} → {formatKey(r.endDate.slice(0, 10))}</p>
                      ))
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Open tasks ({m.openTasks.length})</p>
                    {m.openTasks.slice(0, 2).map((t) => (
                      <p key={t.id} className="truncate">{t.key ? `${t.key}: ` : ""}{t.title} ({t.progress}%)</p>
                    ))}
                    {m.openTasks.length > 2 && <p>+{m.openTasks.length - 2} more</p>}
                    {m.openTasks.length === 0 && <p>None</p>}
                  </div>
                </div>
                {m.courses.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.courses.map((c) => (
                      <span key={c.name} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]">
                        {c.name}
                        <span className="font-semibold text-foreground">{c.percent}%</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
