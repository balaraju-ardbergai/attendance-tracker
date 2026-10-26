"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Network } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, initials } from "@/lib/client";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";

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
  // Directors first, then alphabetical.
  const rank = (n: TreeNode) => (n.user.role === "DIRECTOR" ? 0 : n.user.role === "ADMIN" ? 1 : 2);
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => rank(a) - rank(b) || a.user.name.localeCompare(b.user.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

function PersonCard({ node }: { node: TreeNode }) {
  const u = node.user;
  return (
    <div className="inline-flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 shadow-sm">
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
  );
}

function TreeBranch({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <div className={depth > 0 ? "ml-4 border-l pl-4" : ""}>
      <PersonCard node={node} />
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

export default function OrgGraphPage() {
  const [users, setUsers] = useState<OrgUser[] | null>(null);

  useEffect(() => {
    api<{ users: OrgUser[] }>("/api/org")
      .then((d) => setUsers(d.users))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load the org graph."));
  }, []);

  const tree = useMemo(() => (users ? buildTree(users) : []), [users]);
  const noManager = users?.filter((u) => !u.managerId).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Org Graph</h1>
        <p className="text-sm text-muted-foreground">
          Reporting structure of the organization. Managers are assigned from the Users page.
        </p>
      </div>

      {!users ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-72" />)}</div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Network className="h-4 w-4" /> No active users.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reporting tree</CardTitle>
            <CardDescription>
              {users.length} people · {noManager} at the top of the structure (no manager assigned)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 overflow-x-auto">
            {tree.map((root) => (
              <TreeBranch key={root.user.id} node={root} depth={0} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
