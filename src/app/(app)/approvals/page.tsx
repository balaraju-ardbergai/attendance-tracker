"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Check, X } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/client";
import { formatKey } from "@/lib/dates";
import { APPROVAL_TYPE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type ApprovalDto = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  note: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  requestedBy: { id: string; name: string; email: string };
};

function payloadRows(payload: Record<string, unknown>): [string, string][] {
  const rows: [string, string][] = [];
  if (payload.name) rows.push(["Name", String(payload.name)]);
  if (payload.email) rows.push(["Email", String(payload.email)]);
  if (payload.department) rows.push(["Department", String(payload.department)]);
  if (payload.role) rows.push(["Role", String(payload.role) === "ADMIN" ? "HR Admin" : "Employee"]);
  return rows;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalDto[]>([]);
  const [rejectTarget, setRejectTarget] = useState<ApprovalDto | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ approvals: ApprovalDto[] }>("/api/approvals");
      setApprovals(data.approvals);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load approvals.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(approval: ApprovalDto, action: "APPROVE" | "REJECT", reviewNote?: string) {
    setBusy(true);
    try {
      const data = await api<{ message: string }>(`/api/approvals/${approval.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, note: reviewNote || undefined }),
      });
      toast.success(data.message);
      setRejectTarget(null);
      setNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not process the request.");
    } finally {
      setBusy(false);
    }
  }

  const pending = approvals.filter((a) => a.status === "PENDING");
  const history = approvals.filter((a) => a.status !== "PENDING");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Authorize administrative requests from HR Admins.
        </p>
      </div>

      <div className="space-y-4">
        {pending.length === 0 && (
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <BadgeCheck className="h-4 w-4" /> You&apos;re all caught up — no pending approvals.
            </CardContent>
          </Card>
        )}
        {pending.map((a) => (
          <Card key={a.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{APPROVAL_TYPE_LABEL[a.type] ?? a.type}</CardTitle>
                <CardDescription>
                  Requested by {a.requestedBy.name} · {formatKey(a.createdAt.slice(0, 10))}
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                Pending
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-x-8 gap-y-1 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2 sm:max-w-xl">
                {payloadRows(a.payload).map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
                    <span className="truncate font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide(a, "APPROVE")} disabled={busy}>
                  <Check className="h-4 w-4" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
                  onClick={() => {
                    setRejectTarget(a);
                    setNote("");
                  }}
                  disabled={busy}
                >
                  <X className="h-4 w-4" /> Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
            <CardDescription>Requests you have already reviewed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{APPROVAL_TYPE_LABEL[a.type] ?? a.type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.requestedBy.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          a.status === "APPROVED"
                            ? "border-emerald-500/50 text-emerald-600"
                            : "border-rose-500/50 text-rose-600",
                        )}
                      >
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {a.reviewedAt ? formatKey(a.reviewedAt.slice(0, 10)) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={rejectTarget !== null} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>
              {rejectTarget && (APPROVAL_TYPE_LABEL[rejectTarget.type] ?? rejectTarget.type)}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (rejectTarget) void decide(rejectTarget, "REJECT", note);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="reject-note">Reason (optional)</Label>
              <Input
                id="reject-note"
                placeholder="Shared with the requester via email"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-destructive text-white hover:bg-destructive/90" disabled={busy}>
                Reject
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
