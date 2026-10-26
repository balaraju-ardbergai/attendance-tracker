"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { RequestDialog } from "@/components/request-dialog";
import { useUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { formatKey } from "@/lib/dates";
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type RequestDto = {
  id: string;
  type: "LEAVE" | "WFH";
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    department: string | null;
    pictureUrl: string | null;
  };
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "APPROVED"
      ? "border-emerald-500/50 text-emerald-600"
      : status === "REJECTED"
        ? "border-rose-500/50 text-rose-600"
        : status === "PENDING"
          ? "border-amber-500/50 text-amber-600"
          : "text-muted-foreground";
  return (
    <Badge variant="outline" className={cn(tone)}>
      {REQUEST_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const dateRange = (r: RequestDto) =>
  `${formatKey(r.startDate.slice(0, 10))} → ${formatKey(r.endDate.slice(0, 10))}`;

export default function RequestsPage() {
  const user = useUser();
  const isManager = user?.role === "ADMIN" || user?.role === "DIRECTOR" || user?.isTeamLead;

  const [mine, setMine] = useState<RequestDto[]>([]);
  const [team, setTeam] = useState<RequestDto[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [review, setReview] = useState<{ request: RequestDto; action: "APPROVE" | "REJECT" } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [mineRes, teamRes] = await Promise.all([
        api<{ requests: RequestDto[] }>("/api/requests"),
        isManager ? api<{ requests: RequestDto[] }>("/api/requests?scope=team") : Promise.resolve({ requests: [] }),
      ]);
      setMine(mineRes.requests);
      setTeam(teamRes.requests);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load requests.");
    }
  }, [isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelRequest(id: string) {
    try {
      await api(`/api/requests/${id}`, { method: "PATCH", body: JSON.stringify({ action: "CANCEL" }) });
      toast.success("Request cancelled.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel.");
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!review) return;
    try {
      const data = await api<{ message: string }>(`/api/requests/${review.request.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: review.action, note: note || undefined }),
      });
      toast.success(data.message);
      setReview(null);
      setNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the request.");
    }
  }

  const filteredTeam = team.filter((r) => filter === "ALL" || r.status === filter);

  return (
    <div className="space-y-6">
      <PageHeader title="Requests" description="Leave and work-from-home requests.">
        <Button onClick={() => setDialogOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> New request
        </Button>
      </PageHeader>

      <Tabs defaultValue={isManager ? "team" : "mine"}>
        <TabsList>
          {isManager && <TabsTrigger value="team">Team requests</TabsTrigger>}
          <TabsTrigger value="mine">My requests</TabsTrigger>
        </TabsList>

        {isManager && (
          <TabsContent value="team" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Requests from your people</CardTitle>
                  <CardDescription>Approve or reject leave and WFH requests.</CardDescription>
                </div>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead className="hidden md:table-cell">Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTeam.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Nothing here.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredTeam.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              {r.user?.pictureUrl && <AvatarImage src={r.user.pictureUrl} alt={r.user.name} />}
                              <AvatarFallback className="text-[10px]">{initials(r.user?.name ?? "?")}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{r.user?.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{r.user?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{REQUEST_TYPE_LABEL[r.type]}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{dateRange(r)}</TableCell>
                        <TableCell className="hidden max-w-56 truncate text-sm text-muted-foreground md:table-cell">
                          {r.reason}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status === "PENDING" ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setReview({ request: r, action: "APPROVE" });
                                  setNote("");
                                }}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
                                onClick={() => {
                                  setReview({ request: r, action: "REJECT" });
                                  setNote("");
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {r.reviewNote ? `“${r.reviewNote}”` : "—"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="mine" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My requests</CardTitle>
              <CardDescription>Track and manage the requests you have submitted.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="hidden md:table-cell">Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Reviewer note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mine.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        You haven&apos;t submitted any requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {mine.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{REQUEST_TYPE_LABEL[r.type]}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{dateRange(r)}</TableCell>
                      <TableCell className="hidden max-w-56 truncate text-sm text-muted-foreground md:table-cell">
                        {r.reason}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="hidden max-w-56 truncate text-sm text-muted-foreground lg:table-cell">
                        {r.reviewNote ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === "PENDING" && (
                          <Button size="sm" variant="outline" onClick={() => cancelRequest(r.id)}>
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RequestDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmitted={load} />

      <Dialog open={review !== null} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {review?.action === "APPROVE" ? "Approve request" : "Reject request"}
            </DialogTitle>
            <DialogDescription>
              {review &&
                `${review.request.user?.name} — ${REQUEST_TYPE_LABEL[review.request.type]}, ${dateRange(review.request)}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitReview} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="review-note">Note (optional)</Label>
              <Input
                id="review-note"
                placeholder="Shared with the requester via email"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReview(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className={cn(review?.action === "REJECT" && "bg-destructive text-white hover:bg-destructive/90")}
              >
                Confirm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
