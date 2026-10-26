"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not send the code.");
        return;
      }
      sessionStorage.setItem("reset-email", email);
      setDevCode(data.devCode ?? null);
      setSent(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Forgot password</CardTitle>
        <CardDescription>
          We&apos;ll email you a 6-digit code. It is valid for 5 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sent ? (
          <>
            <Alert>
              <AlertDescription>
                Check your inbox — a code has been sent to <b>{email}</b>.
              </AlertDescription>
            </Alert>
            {devCode && (
              <Alert>
                <AlertDescription>
                  Development mode (no email provider configured) — your code is{" "}
                  <b className="font-mono text-base">{devCode}</b>
                </AlertDescription>
              </Alert>
            )}
            <Button asChild className="w-full">
              <Link href="/reset-password">Enter the code</Link>
            </Button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Registered email</Label>
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send code"}
            </Button>
          </form>
        )}
        <div className="text-center text-sm">
          <Link href="/login" className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
