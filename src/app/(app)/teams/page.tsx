"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IndianRupee, ListTodo, Plus, Users2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { PageHeader } from "@/components/page-header";
import { useUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { rupees } from "@/lib/money";

type TeamListItem = {
  id: string;
  name: string;
  description: string | null;
  lead: { id: string; name: string; email: string; pictureUrl: string | null } | null;
  memberCount: number;
  taskCount: number;
  tasksCompleted: number;
  expenseTotal: number;
};

type UserDto = { id: string; name: string; email: string; isActive: boolean };

export default function TeamsPage() {
  const router = useRouter();
  const me = useUser();
  const canManage = me?.role === "ADMIN" || me?.role === "DIRECTOR";

  const [teams, setTeams] = useState<TeamListItem[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ teams: TeamListItem[] }>("/api/teams");
      setTeams(data.teams);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load teams.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="How the organization is grouped — members, tasks and spend per team."
      >
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New team
          </Button>
        )}
      </PageHeader>

      {!teams ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {canManage ? "No teams yet — create the first one." : "No teams yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <Card
              key={team.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => router.push(`/teams/${team.id}`)}
            >
              <CardHeader>
                <CardTitle className="text-base">{team.name}</CardTitle>
                <CardDescription className="line-clamp-2">{team.description ?? "No description."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users2 className="h-4 w-4 text-muted-foreground" />
                  <div className="flex -space-x-2">
                    {team.lead && (
                      <Avatar key="lead" className="h-7 w-7 ring-2 ring-background">
                        {team.lead.pictureUrl && <AvatarImage src={team.lead.pictureUrl} alt={team.lead.name} />}
                        <AvatarFallback className="text-[10px]">{initials(team.lead.name)}</AvatarFallback>
                      </Avatar>
                    )}
                    <span className="self-center pl-1 text-xs text-muted-foreground">
                      {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
                      {team.lead ? ` · lead ${team.lead.name}` : " · no lead"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ListTodo className="h-3.5 w-3.5" /> {team.tasksCompleted}/{team.taskCount} tasks done
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <IndianRupee className="h-3.5 w-3.5" /> {rupees(team.expenseTotal)} spend
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canManage && <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={load} />}
    </div>
  );
}

function CreateTeamDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState("NONE");
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setLeadId("NONE");
      api<{ users: UserDto[] }>("/api/users")
        .then((d) => setUsers(d.users.filter((u) => u.isActive)))
        .catch(() => setUsers([]));
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api("/api/teams", {
        method: "POST",
        body: JSON.stringify({ name, description: description || undefined, leadId: leadId === "NONE" ? undefined : leadId }),
      });
      toast.success("Team created.");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the team.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>The lead is automatically added as a member.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team name</Label>
            <Input id="team-name" placeholder="e.g. Engineering" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-desc">Description</Label>
            <Textarea id="team-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Team lead (optional)</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger className="w-full"><SelectValue placeholder={users === null ? "Loading…" : "No lead"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No lead</SelectItem>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create team"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
