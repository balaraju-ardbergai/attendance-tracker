"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  History,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Network,
  Plug,
  Users,
  Users2,
  Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserContext, type AppUser } from "@/components/user-context";
import { api, initials } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AppUser["role"][];
  needsExpenseAccess?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/requests", label: "My Requests", icon: ClipboardList },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/teams", label: "Teams", icon: Users2 },
  { href: "/org-graph", label: "Org Graph", icon: Network },
  { href: "/expenses", label: "Expenses", icon: Wallet, needsExpenseAccess: true },
  { href: "/dashboard", label: "Organization", icon: LayoutDashboard, roles: ["ADMIN", "DIRECTOR"] },
  { href: "/users", label: "Users", icon: Users, roles: ["ADMIN", "DIRECTOR"] },
  { href: "/approvals", label: "Approvals", icon: BadgeCheck, roles: ["DIRECTOR"] },
  { href: "/audit", label: "HR Activity", icon: History, roles: ["DIRECTOR"] },
  { href: "/connectors", label: "Connectors", icon: Plug },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AppUser | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api<{ user: AppUser | null }>("/api/me");
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setUser(data.user);
      if (data.user.role === "DIRECTOR") {
        api<{ pendingCount: number }>("/api/approvals")
          .then((d) => setPendingApprovals(d.pendingCount))
          .catch(() => {});
      }
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const items = NAV_ITEMS.filter(
    (item) =>
      (!item.roles || item.roles.includes(user.role)) &&
      (!item.needsExpenseAccess ||
        user.role === "ADMIN" ||
        user.role === "DIRECTOR" ||
        user.expenseAccess),
  );

  const navLinks = (onNavigate?: () => void) =>
    items.map((item) => {
      const active = pathname.startsWith(item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
          {item.href === "/approvals" && pendingApprovals > 0 && (
            <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px]">
              {pendingApprovals}
            </Badge>
          )}
        </Link>
      );
    });

  const userBlock = (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Avatar className="h-9 w-9">
        {user.pictureUrl && <AvatarImage src={user.pictureUrl} alt={user.name} />}
        <AvatarFallback>{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={signOut} title="Sign out" aria-label="Sign out">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <UserContext.Provider value={user}>
      <div className="min-h-screen bg-background">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-4 border-r bg-card p-4 md:flex">
          <Link href="/attendance" className="flex items-center gap-2 px-2 py-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarDays className="h-4 w-4" />
            </span>
            <span className="font-semibold">Attendance Portal</span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1">{navLinks()}</nav>
          {userBlock}
        </aside>

        {/* Mobile top bar + horizontal nav */}
        <div className="sticky top-0 z-30 border-b bg-card md:hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <Link href="/attendance" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-semibold">Attendance Portal</span>
            </Link>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">{navLinks()}</nav>
        </div>

        <main className="px-4 py-6 sm:px-6 md:ml-60">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </UserContext.Provider>
  );
}
