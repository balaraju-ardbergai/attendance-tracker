"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeCheck,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FolderKanban,
  Gauge,
  History,
  LayoutDashboard,
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
import { ChatWidget } from "@/components/chat-widget";
import { api, initials } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AppUser["role"][];
  needsExpenseAccess?: boolean;
  badge?: "approvals";
};

type NavSection = { label: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Work",
    items: [
      { href: "/attendance", label: "Attendance", icon: CalendarCheck },
      { href: "/requests", label: "Requests", icon: ClipboardList },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/courses", label: "Courses", icon: BookOpen },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/teams", label: "Teams", icon: Users2 },
      { href: "/org-graph", label: "Org Graph", icon: Network },
      { href: "/expenses", label: "Expenses", icon: Wallet, needsExpenseAccess: true },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "DIRECTOR"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/users", label: "Users", icon: Users, roles: ["ADMIN", "DIRECTOR"] },
      { href: "/approvals", label: "Approvals", icon: BadgeCheck, roles: ["DIRECTOR"], badge: "approvals" },
      { href: "/audit", label: "HR Activity", icon: History, roles: ["DIRECTOR"] },
      { href: "/connectors", label: "Connectors", icon: Plug },
    ],
  },
];

function visibleSections(user: AppUser) {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        (!item.roles || item.roles.includes(user.role)) &&
        (!item.needsExpenseAccess ||
          user.role === "ADMIN" ||
          user.role === "DIRECTOR" ||
          user.expenseAccess),
    ),
  })).filter((section) => section.items.length > 0);
}

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

  const sections = visibleSections(user);

  const brand = (
    <Link href="/attendance" className="flex items-center gap-2.5 px-2 py-1">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Gauge className="h-4.5 w-4.5" />
      </span>
      <span className="leading-tight">
        <span className="block font-semibold tracking-tight">Org Tracker</span>
        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
          {ROLE_LABEL[user.role]}
        </span>
      </span>
    </Link>
  );

  const sectionNav = (onNavigate?: () => void) =>
    sections.map((section) => (
      <div key={section.label} className="space-y-1">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          {section.label}
        </p>
        {section.items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.badge === "approvals" && pendingApprovals > 0 && (
                <Badge variant="destructive" className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px]">
                  {pendingApprovals}
                </Badge>
              )}
            </Link>
          );
        })}
      </div>
    ));

  const userBlock = (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-2.5 shadow-sm">
      <Avatar className="h-9 w-9">
        {user.pictureUrl && <AvatarImage src={user.pictureUrl} alt={user.name} />}
        <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={signOut} title="Sign out" aria-label="Sign out">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <UserContext.Provider value={user}>
      <div className="min-h-screen bg-background">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-5 border-r bg-sidebar p-4 md:flex">
          {brand}
          <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">{sectionNav()}</nav>
          {userBlock}
        </aside>

        {/* Mobile top bar + horizontal nav */}
        <div className="sticky top-0 z-30 border-b bg-sidebar md:hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            {brand}
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {sections.flatMap((s) => s.items).map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="px-4 py-6 sm:px-8 md:ml-64 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>

        <ChatWidget />
      </div>
    </UserContext.Provider>
  );
}
