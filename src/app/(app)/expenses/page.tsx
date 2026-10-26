"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  IndianRupee,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { BarChartCard, ChartLegend, DonutChartCard } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { useUser } from "@/components/user-context";
import { api } from "@/lib/client";
import { formatKey, serverTodayKey } from "@/lib/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/roles";

const CATEGORIES = ["VENDOR_BILLING", "CLIENT_BILLING", "OFFICE_PURCHASE", "EVENT_PRIZE", "OTHER"];
const rupees = (n: number) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type ExpenseDto = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  party: string | null;
  amount: number;
  date: string;
  teamId: string | null;
  team: { id: string; name: string } | null;
  paymentMethod: string | null;
  receiptUrl: string | null;
  creator: { id: string; name: string };
};

type Analytics = {
  week: { start: string; end: string; total: number; count: number };
  month: { start: string; end: string; total: number; count: number };
  trend: { key: string; label: string; total: number }[];
  byCategory: { category: string; total: number }[];
  byTeam: { teamId: string; name: string; total: number }[];
  topExpenses: { id: string; title: string; category: string; amount: number; date: string }[];
};

type TeamDto = { id: string; name: string };
type UserDto = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  expenseAccess: boolean;
  receivesExpenseReports: boolean;
};

export default function ExpensesPage() {
  const me = useUser();
  const isManager = me?.role === "ADMIN" || me?.role === "DIRECTOR";
  const isDirector = me?.role === "DIRECTOR";

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [expenses, setExpenses] = useState<ExpenseDto[] | null>(null);
  const [teams, setTeams] = useState<TeamDto[]>([]);
  const [denied, setDenied] = useState(false);

  const [fCategory, setFCategory] = useState("ALL");
  const [fTeam, setFTeam] = useState("ALL");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDto | null>(null);
  const [users, setUsers] = useState<UserDto[] | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setAnalytics(await api<Analytics>("/api/expenses/analytics"));
    } catch (err) {
      if (err instanceof Error && err.message.includes("access")) setDenied(true);
      else toast.error(err instanceof Error ? err.message : "Could not load analytics.");
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    const params = new URLSearchParams();
    if (fCategory !== "ALL") params.set("category", fCategory);
    if (fTeam !== "ALL") params.set("teamId", fTeam);
    if (fFrom) params.set("from", fFrom);
    if (fTo) params.set("to", fTo);
    try {
      const data = await api<{ expenses: ExpenseDto[] }>(`/api/expenses?${params.toString()}`);
      setExpenses(data.expenses);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load expenses.");
    }
  }, [fCategory, fTeam, fFrom, fTo]);

  useEffect(() => {
    void loadAnalytics();
    api<{ teams: TeamDto[] }>("/api/teams").then((d) => setTeams(d.teams)).catch(() => {});
    if (isManager) {
      api<{ users: UserDto[] }>("/api/users").then((d) => setUsers(d.users)).catch(() => setUsers([]));
    }
  }, [loadAnalytics, isManager]);

  useEffect(() => {
    if (!denied) void loadExpenses();
  }, [denied, loadExpenses]);

  async function removeExpense(id: string, title: string) {
    if (!window.confirm(`Delete expense “${title}”?`)) return;
    try {
      await api(`/api/expenses/${id}`, { method: "DELETE" });
      toast.success("Expense deleted.");
      await Promise.all([loadExpenses(), loadAnalytics()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  async function sendReport(period: "weekly" | "monthly") {
    try {
      const data = await api<{ message: string }>(`/api/reports/expense/${period}`, { method: "POST" });
      toast.success(data.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the report.");
    }
  }

  async function toggleReports(u: UserDto) {
    const action = u.receivesExpenseReports ? "UNSUBSCRIBE_REPORTS" : "SUBSCRIBE_REPORTS";
    try {
      const data = await api<{ message: string }>(`/api/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      toast.success(data.message);
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, receivesExpenseReports: !u.receivesExpenseReports, expenseAccess: action === "SUBSCRIBE_REPORTS" ? true : x.expenseAccess } : x)) ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the recipient.");
    }
  }

  if (denied) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
          <CardDescription>You don&apos;t have access to Expenses. Directors and HR can grant access.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/attendance">Back to attendance</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const monthTopCategory = analytics?.byCategory.length
    ? [...analytics.byCategory].sort((a, b) => b.total - a.total)[0]
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Vendor & client billings, office purchases and event spends — all in one place."
      >
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Record expense
        </Button>
      </PageHeader>

      {!analytics ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard icon={Wallet} label="This week" sub={`${formatKey(analytics.week.start)} – ${formatKey(analytics.week.end)}`} value={rupees(analytics.week.total)} />
            <SummaryCard icon={IndianRupee} label="This month" sub={`${analytics.month.count} expenses`} value={rupees(analytics.month.total)} />
            <SummaryCard icon={TrendingUp} label="Top category (month)" sub={monthTopCategory ? EXPENSE_CATEGORY_LABEL[monthTopCategory.category] : "None yet"} value={monthTopCategory ? rupees(monthTopCategory.total) : "₹0"} />
            <SummaryCard icon={ReceiptText} label="Recorded expenses" sub="current month" value={String(analytics.month.count)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly trend</CardTitle>
                <CardDescription>Total spend over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChartCard data={analytics.trend.map((t) => ({ label: t.label, value: t.total }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">This month by category</CardTitle>
                <CardDescription>Where the money went</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analytics.byCategory.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No expenses this month yet.</p>
                ) : (
                  <>
                    <DonutChartCard data={analytics.byCategory.map((c) => ({ label: EXPENSE_CATEGORY_LABEL[c.category], value: c.total }))} />
                    <ChartLegend items={analytics.byCategory.map((c) => EXPENSE_CATEGORY_LABEL[c.category])} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">This month by team</CardTitle>
              <CardDescription>Team-attributed spend</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.byTeam.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No team-attributed expenses this month.</p>
              ) : (
                <BarChartCard data={analytics.byTeam.map((t) => ({ label: t.name, value: t.total }))} color="#0ea5e9" height={200} />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">All expenses</TabsTrigger>
          {isManager && <TabsTrigger value="reports">Reports & recipients</TabsTrigger>}
        </TabsList>

        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center gap-3 space-y-0">
              <Select value={fCategory} onValueChange={setFCategory}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fTeam} onValueChange={setFTeam}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All teams</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" className="w-36" value={fFrom} onChange={(e) => setFFrom(e.target.value)} aria-label="From date" />
              <Input type="date" className="w-36" value={fTo} onChange={(e) => setFTo(e.target.value)} aria-label="To date" />
              {(fCategory !== "ALL" || fTeam !== "ALL" || fFrom || fTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFCategory("ALL");
                    setFTeam("ALL");
                    setFFrom("");
                    setFTo("");
                  }}
                >
                  Clear
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!expenses ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : expenses.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No expenses match the filters.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="hidden md:table-cell">Paid to</TableHead>
                      <TableHead className="hidden lg:table-cell">Team</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-sm">{formatKey(e.date.slice(0, 10))}</TableCell>
                        <TableCell className="max-w-56">
                          <p className="truncate text-sm font-medium">{e.title}</p>
                          {e.description && <p className="truncate text-xs text-muted-foreground">{e.description}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">{EXPENSE_CATEGORY_LABEL[e.category]}</Badge>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{e.party ?? "—"}</TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{e.team?.name ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold">{rupees(e.amount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Edit"
                              onClick={() => {
                                setEditing(e);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-600" aria-label="Delete" onClick={() => removeExpense(e.id, e.title)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

        {isManager && (
          <TabsContent value="reports" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scheduled email reports</CardTitle>
                <CardDescription>
                  Weekly reports are sent every Monday 09:00 and monthly reports on the 1st 09:00 (Vercel Cron — set the
                  CRON_SECRET environment variable in production).
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => sendReport("weekly")}>
                  <Send className="h-4 w-4" /> Send weekly report now
                </Button>
                <Button variant="outline" onClick={() => sendReport("monthly")}>
                  <Send className="h-4 w-4" /> Send monthly report now
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Report recipients</CardTitle>
                <CardDescription>
                  {isDirector
                    ? "Pick who receives the weekly and monthly expense emails. Subscribing someone also grants them Expenses access."
                    : "Only Directors can change who receives the reports."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!users ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {users.filter((u) => u.isActive).map((u) => {
                      const inherent = u.role === "DIRECTOR" || u.role === "ADMIN";
                      return (
                        <label key={u.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{u.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {u.email} · {inherent ? "HR / Director" : u.expenseAccess ? "has expense access" : "no expense access"}
                            </span>
                          </span>
                          <Checkbox
                            checked={u.receivesExpenseReports}
                            disabled={!isDirector}
                            onCheckedChange={() => toggleReports(u)}
                            aria-label={`Toggle reports for ${u.name}`}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        teams={teams}
        onSaved={async () => {
          setFormOpen(false);
          await Promise.all([loadExpenses(), loadAnalytics()]);
        }}
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  sub,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{label} · {sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseFormDialog({
  open,
  onOpenChange,
  editing,
  teams,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ExpenseDto | null;
  teams: TeamDto[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("OFFICE_PURCHASE");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(serverTodayKey());
  const [party, setParty] = useState("");
  const [teamId, setTeamId] = useState("NONE");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setCategory(editing?.category ?? "OFFICE_PURCHASE");
      setAmount(editing ? String(editing.amount) : "");
      setDate(editing ? editing.date.slice(0, 10) : serverTodayKey());
      setParty(editing?.party ?? "");
      setTeamId(editing?.teamId ?? "NONE");
      setPaymentMethod(editing?.paymentMethod ?? "");
      setDescription(editing?.description ?? "");
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        title,
        category,
        amount: Number(amount),
        date,
        party: party || undefined,
        teamId: teamId === "NONE" ? null : teamId,
        paymentMethod: paymentMethod || undefined,
        description: description || undefined,
      };
      if (editing) {
        await api(`/api/expenses/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Expense updated.");
      } else {
        await api("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Expense recorded.");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the expense.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit expense" : "Record expense"}</DialogTitle>
          <DialogDescription>Vendor/client billings, office purchases, event prizes — everything counts.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ex-title">Title</Label>
            <Input id="ex-title" placeholder="e.g. Monitor for workstation 4" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ex-amount">Amount (₹)</Label>
              <Input id="ex-amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ex-date">Date</Label>
              <Input id="ex-date" type="date" max={serverTodayKey()} value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ex-team">Team (optional)</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No team</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ex-party">Paid to (vendor / client / person)</Label>
              <Input id="ex-party" placeholder="e.g. Amazon Business" value={party} onChange={(e) => setParty(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ex-pay">Payment method</Label>
              <Input id="ex-pay" placeholder="e.g. UPI, card, bank transfer" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-desc">Notes</Label>
            <Textarea id="ex-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Record expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
