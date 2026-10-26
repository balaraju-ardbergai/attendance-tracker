import { Gauge, CalendarCheck, Wallet, FolderKanban, Users2 } from "lucide-react";

// Split-screen auth shell: brand panel on the left (desktop), form on the right.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const highlights = [
    { icon: CalendarCheck, label: "Attendance, leave & WFH in one place" },
    { icon: FolderKanban, label: "JIRA-style sprints, epics and phases" },
    { icon: Wallet, label: "Expense analytics with email reports" },
    { icon: Users2, label: "Teams, org graph and certification tracking" },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(1200px 500px at 15% -10%, rgba(255,255,255,0.28), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(255,255,255,0.18), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">Org Tracker</p>
            <p className="text-xs text-primary-foreground/70">The pulse of your organization</p>
          </div>
        </div>
        <div className="relative max-w-md space-y-6">
          <h1 className="text-3xl font-semibold leading-snug tracking-tight">
            Everything your team does,
            <br />
            tracked in one calm place.
          </h1>
          <ul className="space-y-3">
            {highlights.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-primary-foreground/85">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Org Tracker · Internal use only
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Gauge className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight">Org Tracker</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
