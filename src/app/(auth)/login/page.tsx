"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginResponse = {
  user?: { mustResetPassword: boolean };
  error?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [microsoftHref, setMicrosoftHref] = useState("/api/auth/microsoft/start");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const error = params.get("error");

    if (next?.startsWith("/") && !next.startsWith("//")) {
      setMicrosoftHref(`/api/auth/microsoft/start?next=${encodeURIComponent(next)}`);
    }

    const messages: Record<string, string> = {
      microsoft: "Microsoft sign-in failed. Please try again.",
      microsoft_config: "Microsoft sign-in is not configured yet.",
      microsoft_email: "Microsoft did not return an email address for this account.",
      microsoft_unknown: "Your Microsoft account is not active in this portal.",
    };
    if (error && messages[error]) toast.error(messages[error]);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data: LoginResponse = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Sign in failed.");
        return;
      }
      if (data.user?.mustResetPassword) {
        router.replace("/change-password");
      } else {
        const next = new URLSearchParams(window.location.search).get("next");
        router.replace(next && next.startsWith("/") ? next : "/attendance");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <CalendarCheck className="h-6 w-6" />
        </div>
        <CardTitle className="text-xl">Attendance Portal</CardTitle>
        <CardDescription>Sign in with your work email</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@org.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button asChild variant="outline" className="w-full">
          <a href={microsoftHref}>
            <Mail className="h-4 w-4" /> Continue with Microsoft
          </a>
        </Button>
        <div className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">
            Forgot your password?
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
