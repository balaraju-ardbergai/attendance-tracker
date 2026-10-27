"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Info, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { useUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/roles";

type UserDto = {
  id: string;
  name: string;
  email: string;
  role: "DIRECTOR" | "ADMIN" | "EMPLOYEE";
  department: string | null;
  pictureUrl: string | null;
  isActive: boolean;
  createdAt: string;
  managerId: string | null;
  expenseAccess: boolean;
  receivesExpenseReports: boolean;
};

export default function UsersPage() {
  const me = useUser();
  const isDirector = me?.role === "DIRECTOR";

  const [users, setUsers] = useState<UserDto[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserDto | null>(null);
  const [managerTarget, setManagerTarget] = useState<UserDto | null>(null);
  const [managerId, setManagerId] = useState("NONE");
  const [created, setCreated] = useState<{ name: string; tempPassword: string } | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [usersRes, approvalsRes] = await Promise.all([
        api<{ users: UserDto[] }>("/api/users"),
        isDirector
          ? api<{ pendingCount: number }>("/api/approvals")
          : Promise.resolve({ pendingCount: 0 }),
      ]);
      setUsers(usersRes.users);
      setPendingCount(approvalsRes.pendingCount);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load users.");
    }
  }, [isDirector]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetAddForm() {
    setName("");
    setEmail("");
    setDepartment("");
    setRole("EMPLOYEE");
    setCreated(null);
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await api<{ message: string; tempPassword?: string }>("/api/users", {
        method: "POST",
        body: JSON.stringify({ name, email, department: department || undefined, role }),
      });
      if (data.tempPassword) {
        setCreated({ name, tempPassword: data.tempPassword });
        toast.success(data.message);
      } else {
        toast.success(data.message);
        setAddOpen(false);
        resetAddForm();
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchUser(id: string, action: string) {
    try {
      const data = await api<{ message: string }>(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      toast.success(data.message);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSubmitting(true);
    try {
      await api(`/api/users/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "UPDATE", name, department }),
      });
      toast.success("Profile updated.");
      setEditTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveManager(e: React.FormEvent) {
    e.preventDefault();
    if (!managerTarget) return;
    setSubmitting(true);
    try {
      const data = await api<{ message: string }>(`/api/users/${managerTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "SET_MANAGER", managerId: managerId === "NONE" ? null : managerId }),
      });
      toast.success(data.message);
      setManagerTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set the manager.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={`Add people and manage their roles. Major changes need Director approval${isDirector ? " — you can apply them directly." : "."}`}
      >
        <Button
          onClick={() => {
            resetAddForm();
            setAddOpen(true);
          }}
        >
          <UserPlus className="h-4 w-4" /> Add user
        </Button>
      </PageHeader>

      {isDirector && pendingCount > 0 && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span>
              {pendingCount} approval request{pendingCount > 1 ? "s" : ""} waiting for you.{" "}
              <Link href="/approvals" className="font-medium underline underline-offset-4">
                Review
              </Link>
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={!u.isActive ? "opacity-60" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        {u.pictureUrl && <AvatarImage src={u.pictureUrl} alt={u.name} />}
                        <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === "DIRECTOR" ? "default" : u.role === "ADMIN" ? "secondary" : "outline"}>
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {u.department ?? "—"}
                    {u.managerId && (
                      <span className="block text-xs text-muted-foreground">
                        Manager: {users.find((x) => x.id === u.managerId)?.name ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={u.isActive ? "border-emerald-500/50 text-emerald-600" : "text-muted-foreground"}>
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.role !== "DIRECTOR" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Manage
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditTarget(u);
                              setName(u.name);
                              setDepartment(u.department ?? "");
                            }}
                          >
                            Edit profile
                          </DropdownMenuItem>
                          {u.role === "EMPLOYEE" && u.isActive && (
                            <DropdownMenuItem onClick={() => patchUser(u.id, "ASSIGN_HR")}>
                              {isDirector ? "Assign as HR" : "Request HR assignment"}
                            </DropdownMenuItem>
                          )}
                          {u.role === "ADMIN" && (
                            <DropdownMenuItem onClick={() => patchUser(u.id, "SET_EMPLOYEE")}>
                              {isDirector ? "Change to Employee" : "Request role change"}
                            </DropdownMenuItem>
                          )}
                          {u.isActive && (
                            <DropdownMenuItem
                              onClick={() => {
                                setManagerTarget(u);
                                setManagerId(u.managerId ?? "NONE");
                              }}
                            >
                              Set manager…
                            </DropdownMenuItem>
                          )}
                          {u.isActive && !u.expenseAccess && (
                            <DropdownMenuItem onClick={() => patchUser(u.id, "GRANT_EXPENSE")}>
                              Grant expense access
                            </DropdownMenuItem>
                          )}
                          {u.expenseAccess && (
                            <DropdownMenuItem onClick={() => patchUser(u.id, "REVOKE_EXPENSE")}>
                              Revoke expense access
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {u.isActive ? (
                            <DropdownMenuItem
                              className="text-rose-600 focus:text-rose-600"
                              onClick={() => patchUser(u.id, "DEACTIVATE")}
                            >
                              {isDirector ? "Remove user" : "Request removal"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => patchUser(u.id, "REACTIVATE")}>
                              {isDirector ? "Reactivate" : "Request reactivation"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add user dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); resetAddForm(); } }}>
        <DialogContent className="sm:max-w-md">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>Invitation ready</DialogTitle>
                <DialogDescription>
                  {created.name} has been added and an invitation email has been sent. Share the
                  temporary password if the email doesn&apos;t arrive:
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg bg-muted p-4 text-center">
                <p className="font-mono text-2xl font-semibold tracking-wider">{created.tempPassword}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The user must set a new password at first sign-in.
                </p>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setAddOpen(false);
                    resetAddForm();
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add user</DialogTitle>
                <DialogDescription>
                  {isDirector
                    ? "The person will be created immediately and receive an invitation email."
                    : "This request goes to the Director for approval. The user is created once approved."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="add-name">Full name</Label>
                  <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-email">Email</Label>
                  <Input
                    id="add-email"
                    type="email"
                    placeholder="person@org.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="add-department">Department</Label>
                    <Input
                      id="add-department"
                      placeholder="Engineering"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={role} onValueChange={setRole} disabled={!isDirector}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMPLOYEE">Employee</SelectItem>
                        {isDirector && <SelectItem value="ADMIN">HR Admin</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving…" : isDirector ? "Create user" : "Send for approval"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit profile dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>{editTarget?.email}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full name</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-department">Department</Label>
              <Input
                id="edit-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Set manager dialog */}
      <Dialog open={managerTarget !== null} onOpenChange={(open) => !open && setManagerTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set manager</DialogTitle>
            <DialogDescription>{managerTarget?.email} — shown in the Org Graph.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveManager} className="space-y-4">
            <div className="space-y-2">
              <Label>Reports to</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No manager</SelectItem>
                  {users
                    .filter((x) => x.isActive && x.id !== managerTarget?.id)
                    .map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.name} ({ROLE_LABEL[x.role]})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setManagerTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
