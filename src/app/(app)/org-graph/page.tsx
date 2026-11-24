"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { Network, Pin, PinOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeDetailDialog } from "@/components/employee-detail-dialog";
import { useUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

type OrgUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  department: string | null;
  pictureUrl: string | null;
  managerId: string | null;
};

type TreeNode = { user: OrgUser; children: TreeNode[] };

function buildTree(users: OrgUser[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(users.map((u) => [u.id, { user: u, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const manager = node.user.managerId ? byId.get(node.user.managerId) : undefined;
    if (manager && manager.user.id !== node.user.id) manager.children.push(node);
    else roots.push(node);
  }
  const rank = (n: TreeNode) => (n.user.role === "DIRECTOR" ? 0 : n.user.role === "ADMIN" ? 1 : 2);
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => rank(a) - rank(b) || a.user.name.localeCompare(b.user.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

export default function OrgGraphPage() {
  const me = useUser();
  const canEdit = me?.role === "ADMIN" || me?.role === "DIRECTOR";
  const canInspect = canEdit || me?.isTeamLead;

  const [users, setUsers] = useState<OrgUser[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const [overviewId, setOverviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ users: OrgUser[] }>("/api/org");
      setUsers(data.users);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the org graph.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assignManager(userId: string, managerId: string | null) {
    if (userId === managerId) return;
    const person = users?.find((u) => u.id === userId);
    if (person && person.managerId === managerId) return; // no change
    // Optimistic update; the server rejects cycles.
    setUsers((prev) => prev?.map((u) => (u.id === userId ? { ...u, managerId } : u)) ?? null);
    try {
      const data = await api<{ message: string }>(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "SET_MANAGER", managerId }),
      });
      toast.success(data.message);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the hierarchy.");
      await load();
    }
  }

  const tree = useMemo(() => (users ? buildTree(users) : []), [users]);
  const managedCount = users?.filter((u) => u.managerId).length ?? 0;

  function PersonCard({ node, depth }: { node: TreeNode; depth: number }) {
    const u = node.user;
    const isDragging = draggingId === u.id;
    const isTarget = dragOverId === u.id && draggingId !== null && draggingId !== u.id;
    return (
      <div className={cn(depth > 0 && "ml-5 border-l pl-5")}>
        <div
          draggable={canEdit && !isDragging}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", u.id);
            e.dataTransfer.effectAllowed = "move";
            setDraggingId(u.id);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDragOverId(null);
            setDragOverRoot(false);
          }}
          onDragOver={(e) => {
            if (!canEdit || !draggingId || draggingId === u.id) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverId(u.id);
          }}
          onDragLeave={() => setDragOverId((prev) => (prev === u.id ? null : prev))}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const draggedId = e.dataTransfer.getData("text/plain");
            setDragOverId(null);
            if (draggedId && draggedId !== u.id) {
              void assignManager(draggedId, u.id);
            }
          }}
          onClick={() => canInspect && setOverviewId(u.id)}
          className={cn(
            "inline-flex max-w-full items-center gap-2.5 rounded-xl border bg-card px-3 py-2 shadow-sm transition-all",
            canEdit && "cursor-grab active:cursor-grabbing",
            canInspect && "cursor-pointer hover:shadow-md",
            isTarget && "border-primary bg-accent ring-2 ring-primary/40",
            isDragging && "opacity-40",
          )}
          title={
            canEdit
              ? "Drag onto someone to make them this person's manager"
              : canInspect
                ? "Click for details"
                : undefined
          }
        >
          <Avatar className="h-8 w-8">
            {u.pictureUrl && <AvatarImage src={u.pictureUrl} alt={u.name} />}
            <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{u.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ROLE_LABEL[u.role]} {u.department ? `· ${u.department}` : ""}
            </p>
          </div>
          {node.children.length > 0 && (
            <Badge variant="secondary" className="ml-1 shrink-0 text-[10px]">
              {node.children.length}
            </Badge>
          )}
        </div>
        {node.children.length > 0 && (
          <div className="mt-2 space-y-2">
            {node.children.map((child) => (
              <TreeBranch key={child.user.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  function TreeBranch({ node, depth }: { node: TreeNode; depth: number }) {
    return <PersonCard node={node} depth={depth} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Org Graph"
        description={
          canEdit
            ? "Reporting structure of the organization. Drag a person onto someone to make that person their manager — or onto the top-level tray to remove a manager."
            : "Reporting structure of the organization. Managers are assigned from the Users page."
        }
      />

      {!users ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-72" />)}</div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Network className="h-4 w-4" /> No active users.
          </CardContent>
        </Card>
      ) : (
        <>
          {canEdit && (
            <Card
              className={cn(
                "flex items-center gap-3 border-dashed p-4 text-sm text-muted-foreground transition-colors",
                dragOverRoot && "border-primary bg-accent/60 text-foreground ring-2 ring-primary/30",
              )}
              onDragOver={(e) => {
                if (!draggingId) return;
                e.preventDefault();
                setDragOverRoot(true);
              }}
              onDragLeave={() => setDragOverRoot(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverRoot(false);
                const draggedId = e.dataTransfer.getData("text/plain");
                if (draggedId) void assignManager(draggedId, null);
              }}
            >
              {dragOverRoot ? <PinOff className="h-4 w-4 text-primary" /> : <Pin className="h-4 w-4" />}
              Drop here to put someone at the top of the hierarchy (no manager).
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reporting tree</CardTitle>
              <CardDescription>
                {users.length} people · {users.length - managedCount} at the top of the structure
                {canEdit && " · drag cards to restructure"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 overflow-x-auto">
              {tree.map((root) => (
                <TreeBranch key={root.user.id} node={root} depth={0} />
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <EmployeeDetailDialog employeeId={canInspect ? overviewId : null} onClose={() => setOverviewId(null)} />
    </div>
  );
}

