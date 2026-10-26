"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/client";
import { AUDIT_ACTION_LABEL } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";

type AuditDto = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
  targetUser: { name: string; email: string } | null;
};

function describe(a: AuditDto): string {
  const parts: string[] = [];
  const details = a.details ?? {};
  if (typeof details.email === "string") parts.push(details.email);
  if (typeof details.type === "string" && details.type !== a.action) parts.push(details.type);
  if (typeof details.targetEmail === "string") parts.push(details.targetEmail);
  return parts.join(" · ");
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditDto[] | null>(null);

  useEffect(() => {
    api<{ logs: AuditDto[] }>("/api/audit")
      .then((d) => setLogs(d.logs))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load activity."));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="HR Activity" description="Actions taken by HR Admins and Directors across the organization." />

      <Card>
        <CardContent className="pt-6">
          {!logs ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden md:table-cell">Target</TableHead>
                  <TableHead className="hidden lg:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No activity recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {logs.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString([], {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-sm">{a.actor?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {AUDIT_ACTION_LABEL[a.action] ?? a.action}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {a.targetUser?.name ?? "—"}
                    </TableCell>
                    <TableCell
                      className="hidden max-w-64 truncate text-xs text-muted-foreground lg:table-cell"
                      title={a.details ? JSON.stringify(a.details) : undefined}
                    >
                      {describe(a) || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
