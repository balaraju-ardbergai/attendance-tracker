"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  Clock,
  FolderKanban,
  KeyRound,
  Mail,
  Pencil,
  Plug,
  Sparkles,
  Users2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { StatBar } from "@/components/stat-bar";
import { RequestDialog } from "@/components/request-dialog";
import { api, initials, timeLabel } from "@/lib/client";
import { formatKey } from "@/lib/dates";
import { ATTENDANCE_STATUS_LABEL, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, ROLE_LABEL, TASK_PRIORITY_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type ProfileData = {
  identity: {
    id: string;
    legalName: string;
    displayName: string;
    email: string;
    role: string;
    department: string | null;
    pictureUrl: string | null;
    createdAt: string;
  };
  profile: {
    preferredName: string;
    phone: string;
    pronouns: string;
    location: string;
    timezone: string;
    bio: string;
    emergencyContactName: string;
    emergencyContactRelationship: string;
    emergencyContactPhone: string;
  };
  organization: {
    manager: { id: string; name: string; email: string; role: string; pictureUrl: string | null } | null;
    teams: { id: string; name: string; description: string | null; lead: { id: string; name: string } | null }[];
    teamsLed: { id: string; name: string; memberCount: number }[];
    directReports: number;
  };
  attendance: {
    today: { status: string; clockInAt: string | null; clockOutAt: string | null } | null;
    stats: { workingDays: number; present: number; leave: number; wfh: number; absent: number };
    year: number;
    month: number;
  };
  requests: {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    reviewNote: string | null;
    createdAt: string;
  }[];
  issues: {
    id: string;
    key: string | null;
    title: string;
    status: string;
    priority: string;
    progress: number;
    dueDate: string | null;
    storyPoints: number | null;
    project: { id: string; key: string; name: string } | null;
    sprint: { id: string; name: string; status: string } | null;
    phase: { id: string; name: string; order: number } | null;
  }[];
  courses: {
    id: string;
    name: string;
    description: string | null;
    attendanceEnabled: boolean;
    enrolledAt: string;
    percent: number;
    stepsCompleted: number;
    totalSteps: number;
    currentMilestone: { id: string; name: string } | null;
    nextSession: { id: string; date: string; topic: string | null } | null;
  }[];
  skills: { id: string; skillId: string; name: string; proficiency: number; evidence: string | null }[];
  connections: { id: string; provider: string; accountEmail: string | null; connectedAt: string }[];
  capabilities: { isTeamLead: boolean; expenseAccess: boolean; receivesExpenseReports: boolean };
  attention: { attendanceNotMarked: boolean; overdueIssues: number; pendingRequests: number; incompleteCourses: number };
};

const priorityTone = (priority: string) =>
  priority === "HIGH" ? "border-rose-500/50 text-rose-600" : priority === "MEDIUM" ? "border-amber-500/50 text-amber-600" : "text-muted-foreground";

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<ProfileData>("/api/profile"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full lg:col-span-2" />
        </div>
      </div>
    );
  }

  const needsAttention =
    data.attention.attendanceNotMarked ||
    data.attention.overdueIssues > 0 ||
    data.attention.pendingRequests > 0 ||
    data.attention.incompleteCourses > 0;

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" description="Your personal information, work, learning and account settings." />

      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/90 via-primary to-violet-500" />
        <CardContent className="-mt-10 flex flex-wrap items-end gap-4 p-6 pt-0">
          <Avatar className="h-20 w-20 border-4 border-card shadow-sm">
            {data.identity.pictureUrl && <AvatarImage src={data.identity.pictureUrl} alt={data.identity.displayName} />}
            <AvatarFallback className="text-xl">{initials(data.identity.displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold">{data.identity.displayName}</h2>
              <Badge variant="secondary">{ROLE_LABEL[data.identity.role as keyof typeof ROLE_LABEL] ?? data.identity.role}</Badge>
              {data.capabilities.isTeamLead && <Badge variant="outline">Team lead</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {data.identity.email}{data.identity.department ? ` · ${data.identity.department}` : ""}
            </p>
          </div>
          <div className="flex gap-2 pb-1">
            <Button asChild variant="outline" size="sm"><Link href="/change-password"><KeyRound className="h-4 w-4" /> Change password</Link></Button>
            <Button asChild size="sm"><Link href="/projects">My work</Link></Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="personal">Personal information</TabsTrigger>
          <TabsTrigger value="career">Career & learning</TabsTrigger>
          <TabsTrigger value="account">Account & connections</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {needsAttention && <AttentionCard data={data} onRequest={() => setRequestOpen(true)} />}
          <QuickActions data={data} onRequest={() => setRequestOpen(true)} />
          <div className="grid gap-4 lg:grid-cols-2">
            <AttendanceCard data={data} />
            <OrganizationCard data={data} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <IssuesCard issues={data.issues} />
            <RequestsCard requests={data.requests} />
          </div>
          <CoursesCard courses={data.courses} compact />
        </TabsContent>

        <TabsContent value="personal" className="mt-4">
          <PersonalInformation data={data} onSaved={load} />
        </TabsContent>

        <TabsContent value="career" className="mt-4 space-y-4">
          <SkillsCard skills={data.skills} onChanged={load} />
          <CoursesCard courses={data.courses} />
          {(data.organization.teamsLed.length > 0 || data.organization.directReports > 0) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Leadership</CardTitle><CardDescription>Teams and people you lead.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.organization.teamsLed.map((team) => (
                  <Button key={team.id} asChild variant="outline" size="sm">
                    <Link href={`/teams/${team.id}`}><Users2 className="h-4 w-4" /> {team.name} · {team.memberCount} members</Link>
                  </Button>
                ))}
                {data.organization.directReports > 0 && <Badge variant="secondary">{data.organization.directReports} direct reports</Badge>}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="account" className="mt-4 space-y-4">
          <AccountCard data={data} />
          <ConnectionsCard connections={data.connections} />
        </TabsContent>
      </Tabs>

      <RequestDialog open={requestOpen} onOpenChange={setRequestOpen} onSubmitted={load} />
    </div>
  );
}

function AttentionCard({ data, onRequest }: { data: ProfileData; onRequest: () => void }) {
  const items = [
    data.attention.attendanceNotMarked && { label: "Attendance not marked today", href: "/attendance", action: "Mark now" },
    data.attention.overdueIssues > 0 && { label: `${data.attention.overdueIssues} overdue work item(s)`, href: "/projects", action: "Review" },
    data.attention.pendingRequests > 0 && { label: `${data.attention.pendingRequests} request(s) awaiting review`, href: "/requests", action: "Track" },
    data.attention.incompleteCourses > 0 && { label: `${data.attention.incompleteCourses} course(s) in progress`, href: "/courses", action: "Continue" },
  ].filter(Boolean) as { label: string; href: string; action: string }[];
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600" /> Needs attention</CardTitle></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/50">
            <span>{item.label}</span><span className="text-xs font-medium text-primary">{item.action} →</span>
          </Link>
        ))}
        <button onClick={onRequest} className="flex items-center justify-between rounded-lg border bg-card p-3 text-left text-sm transition-colors hover:bg-muted/50">
          <span>Need leave or WFH?</span><span className="text-xs font-medium text-primary">Request →</span>
        </button>
      </CardContent>
    </Card>
  );
}

function QuickActions({ data, onRequest }: { data: ProfileData; onRequest: () => void }) {
  const currentCourse = data.courses.find((course) => course.percent < 100);
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link href="/attendance"><CalendarCheck className="h-4 w-4" /> Attendance</Link></Button>
        <Button variant="outline" onClick={onRequest}>Request leave / WFH</Button>
        <Button asChild variant="outline"><Link href="/projects"><FolderKanban className="h-4 w-4" /> My work</Link></Button>
        {currentCourse && <Button asChild variant="outline"><Link href={`/courses/${currentCourse.id}`}><BookOpen className="h-4 w-4" /> Continue course</Link></Button>}
        <Button asChild variant="outline"><Link href="/connectors"><Plug className="h-4 w-4" /> Connections</Link></Button>
      </CardContent>
    </Card>
  );
}

function AttendanceCard({ data }: { data: ProfileData }) {
  const { today, stats } = data.attendance;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Attendance</CardTitle><CardDescription>This month</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium"><Clock className="h-4 w-4 text-muted-foreground" /> Today</span>
          {today ? (
            <span className="text-muted-foreground">{ATTENDANCE_STATUS_LABEL[today.status]}{today.clockInAt ? ` · in ${timeLabel(today.clockInAt)}` : ""}{today.clockOutAt ? ` · out ${timeLabel(today.clockOutAt)}` : ""}</span>
          ) : <Button asChild size="sm"><Link href="/attendance">Mark now</Link></Button>}
        </div>
        <StatBar stats={stats} />
        <p className="text-xs text-muted-foreground">{stats.present} present · {stats.leave} leave · {stats.wfh} WFH · {stats.absent} absent · {stats.workingDays} working days</p>
      </CardContent>
    </Card>
  );
}

function OrganizationCard({ data }: { data: ProfileData }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Organization</CardTitle><CardDescription>Your manager and teams</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {data.organization.manager ? (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Avatar className="h-9 w-9">{data.organization.manager.pictureUrl && <AvatarImage src={data.organization.manager.pictureUrl} alt={data.organization.manager.name} />}<AvatarFallback className="text-xs">{initials(data.organization.manager.name)}</AvatarFallback></Avatar>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{data.organization.manager.name}</p><p className="text-xs text-muted-foreground">Manager · {ROLE_LABEL[data.organization.manager.role as keyof typeof ROLE_LABEL]}</p></div>
          </div>
        ) : <p className="text-sm text-muted-foreground">No manager assigned.</p>}
        <div className="flex flex-wrap gap-2">
          {data.organization.teams.map((team) => <Button key={team.id} asChild size="sm" variant="outline"><Link href={`/teams/${team.id}`}><Users2 className="h-4 w-4" /> {team.name}</Link></Button>)}
          {data.organization.teams.length === 0 && <span className="text-sm text-muted-foreground">Not assigned to a team.</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function IssuesCard({ issues }: { issues: ProfileData["issues"] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">My open work</CardTitle><CardDescription>{issues.length} assigned item(s)</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {issues.slice(0, 6).map((issue) => (
          <Link key={issue.id} href={issue.project ? `/projects/${issue.project.id}?issue=${issue.id}` : "/projects"} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors hover:bg-muted/50">
            <span className="font-mono text-[10px] text-muted-foreground">{issue.key ?? "TASK"}</span><span className="min-w-0 flex-1 truncate">{issue.title}</span><Badge variant="outline" className={cn("text-[10px]", priorityTone(issue.priority))}>{TASK_PRIORITY_LABEL[issue.priority]}</Badge><span className="text-xs text-muted-foreground">{issue.progress}%</span>
          </Link>
        ))}
        {issues.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No open work items.</p>}
        {issues.length > 6 && <Button asChild variant="ghost" size="sm" className="w-full"><Link href="/projects">View all →</Link></Button>}
      </CardContent>
    </Card>
  );
}

function RequestsCard({ requests }: { requests: ProfileData["requests"] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">My requests</CardTitle><CardDescription>Recent leave and WFH activity</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {requests.slice(0, 5).map((request) => (
          <Link key={request.id} href="/requests" className="flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors hover:bg-muted/50">
            <span className="min-w-0 flex-1">{REQUEST_TYPE_LABEL[request.type]} · {formatKey(request.startDate)} → {formatKey(request.endDate)}</span><Badge variant="outline" className="text-[10px]">{REQUEST_STATUS_LABEL[request.status]}</Badge>
          </Link>
        ))}
        {requests.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No requests yet.</p>}
      </CardContent>
    </Card>
  );
}

function CoursesCard({ courses, compact = false }: { courses: ProfileData["courses"]; compact?: boolean }) {
  const shown = compact ? courses.slice(0, 4) : courses;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Courses & certifications</CardTitle><CardDescription>{courses.length} enrolled course(s)</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {shown.map((course) => (
          <Link key={course.id} href={`/courses/${course.id}`} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
            <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{course.name}</p><p className="text-xs text-muted-foreground">{course.stepsCompleted}/{course.totalSteps} milestones · {course.currentMilestone ? `Currently at ${course.currentMilestone.name}` : "Completed"}</p></div><span className="text-sm font-semibold">{course.percent}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${course.percent}%` }} /></div>
            {course.nextSession && <p className="mt-2 text-[11px] text-muted-foreground">Next class: {formatKey(course.nextSession.date)}{course.nextSession.topic ? ` · ${course.nextSession.topic}` : ""}</p>}
          </Link>
        ))}
        {courses.length === 0 && <p className="text-sm text-muted-foreground">No courses assigned yet.</p>}
      </CardContent>
    </Card>
  );
}

function PersonalInformation({ data, onSaved }: { data: ProfileData; onSaved: () => void }) {
  const [form, setForm] = useState(data.profile);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(data.profile), [data.profile]);
  const set = (key: keyof ProfileData["profile"], value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try { const res = await api<{ message: string }>("/api/profile", { method: "PATCH", body: JSON.stringify(form) }); toast.success(res.message); onSaved(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not save your information."); }
    finally { setSaving(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Personal information</CardTitle><CardDescription>You own these fields and can update them at any time.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred name" value={form.preferredName} onChange={(v) => set("preferredName", v)} />
          <Field label="Pronouns" value={form.pronouns} onChange={(v) => set("pronouns", v)} />
          <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="+91 98765 43210" />
          <Field label="Location" value={form.location} onChange={(v) => set("location", v)} placeholder="Hyderabad, India" />
          <Field label="Timezone" value={form.timezone} onChange={(v) => set("timezone", v)} placeholder="Asia/Kolkata" />
          <div className="space-y-2 sm:col-span-2"><Label>Bio</Label><Textarea rows={4} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="A short introduction…" /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Emergency contact</CardTitle><CardDescription>Visible only in your self-service profile and authorized HR workflows.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" value={form.emergencyContactName} onChange={(v) => set("emergencyContactName", v)} />
          <Field label="Relationship" value={form.emergencyContactRelationship} onChange={(v) => set("emergencyContactRelationship", v)} />
          <Field label="Phone" value={form.emergencyContactPhone} onChange={(v) => set("emergencyContactPhone", v)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Employment information</CardTitle><CardDescription>Managed by HR — contact HR if anything is incorrect.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <ReadOnly label="Legal name" value={data.identity.legalName} />
          <ReadOnly label="Work email" value={data.identity.email} />
          <ReadOnly label="Department" value={data.identity.department ?? "Not assigned"} />
          <ReadOnly label="Role" value={ROLE_LABEL[data.identity.role as keyof typeof ROLE_LABEL] ?? data.identity.role} />
          <ReadOnly label="Manager" value={data.organization.manager?.name ?? "Not assigned"} />
          <ReadOnly label="Employee since" value={formatKey(data.identity.createdAt.slice(0, 10))} />
        </CardContent>
      </Card>
      <div className="flex justify-end"><Button type="submit" disabled={saving}><Pencil className="h-4 w-4" /> {saving ? "Saving…" : "Save personal information"}</Button></div>
    </form>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}
function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/30 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}

function SkillsCard({ skills, onChanged }: { skills: ProfileData["skills"]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProfileData["skills"][number] | null>(null);
  async function remove(id: string) {
    try { const res = await api<{ message: string }>(`/api/profile/skills?id=${id}`, { method: "DELETE" }); toast.success(res.message); onChanged(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not remove the skill."); }
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base">Skills</CardTitle><CardDescription>Employee-confirmed skills and proficiency.</CardDescription></div><Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Sparkles className="h-4 w-4" /> Add skill</Button></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <button key={skill.id} onClick={() => { setEditing(skill); setOpen(true); }} className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted/50" title={skill.evidence ?? "Edit skill"}>{skill.name} · {skill.proficiency}/5</button>
        ))}
        {skills.length === 0 && <p className="text-sm text-muted-foreground">No skills added yet.</p>}
      </CardContent>
      <SkillDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => { setOpen(false); onChanged(); }} onRemove={editing ? () => remove(editing.id) : undefined} />
    </Card>
  );
}

function SkillDialog({ open, onOpenChange, editing, onSaved, onRemove }: { open: boolean; onOpenChange: (open: boolean) => void; editing: ProfileData["skills"][number] | null; onSaved: () => void; onRemove?: () => void }) {
  const [name, setName] = useState(""); const [proficiency, setProficiency] = useState("3"); const [evidence, setEvidence] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setName(editing?.name ?? ""); setProficiency(String(editing?.proficiency ?? 3)); setEvidence(editing?.evidence ?? ""); } }, [open, editing]);
  async function submit(e: React.FormEvent) { e.preventDefault(); setSaving(true); try { const res = await api<{ message: string }>("/api/profile/skills", { method: editing ? "PATCH" : "POST", body: JSON.stringify(editing ? { id: editing.id, proficiency: Number(proficiency), evidence } : { name, proficiency: Number(proficiency), evidence }) }); toast.success(res.message); onSaved(); } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save the skill."); } finally { setSaving(false); } }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{editing ? "Edit skill" : "Add skill"}</DialogTitle><DialogDescription>Rate proficiency from 1 (learning) to 5 (expert).</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label>Skill</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={Boolean(editing)} required /></div><div className="space-y-2"><Label>Proficiency</Label><Select value={proficiency} onValueChange={setProficiency}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5].map((v) => <SelectItem key={v} value={String(v)}>{v} / 5</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Evidence / notes</Label><Textarea rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} /></div><DialogFooter className="flex-row justify-between">{onRemove ? <Button type="button" variant="ghost" className="text-rose-600" onClick={onRemove}>Remove</Button> : <span />}<div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div></DialogFooter></form></DialogContent></Dialog>
  );
}

function AccountCard({ data }: { data: ProfileData }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Account & access</CardTitle><CardDescription>Access is managed by HR and Directors.</CardDescription></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ReadOnly label="Role" value={ROLE_LABEL[data.identity.role as keyof typeof ROLE_LABEL] ?? data.identity.role} />
        <ReadOnly label="Expense access" value={data.capabilities.expenseAccess ? "Enabled" : "Not enabled"} />
        <ReadOnly label="Expense reports" value={data.capabilities.receivesExpenseReports ? "Subscribed" : "Not subscribed"} />
        <ReadOnly label="Team lead" value={data.capabilities.isTeamLead ? "Yes" : "No"} />
      </CardContent>
    </Card>
  );
}

function ConnectionsCard({ connections }: { connections: ProfileData["connections"] }) {
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base">Connections</CardTitle><CardDescription>External identities linked to your account.</CardDescription></div><Button asChild variant="outline" size="sm"><Link href="/connectors"><Plug className="h-4 w-4" /> Manage</Link></Button></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {[{ id: "gmail", label: "Gmail" }, { id: "outlook", label: "Outlook" }].map((provider) => {
          const connection = byProvider.get(provider.id);
          return <div key={provider.id} className="flex items-center gap-3 rounded-lg border p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><Mail className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{provider.label}</p><p className="truncate text-xs text-muted-foreground">{connection?.accountEmail ?? "Not connected"}</p></div><Badge variant="outline" className={connection ? "border-emerald-500/50 text-emerald-600" : "text-muted-foreground"}>{connection ? "Connected" : "Not connected"}</Badge></div>;
        })}
      </CardContent>
    </Card>
  );
}
