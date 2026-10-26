"use client";

import { useCallback, useEffect, useState } from "react";
import { Suspense } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client";

type ProviderDto = {
  id: "outlook" | "gmail";
  label: string;
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
};

const BRAND: Record<string, { color: string; blurb: string }> = {
  outlook: { color: "bg-[#0078d4]", blurb: "Sync your Outlook email and calendar." },
  gmail: { color: "bg-[#ea4335]", blurb: "Sync your Gmail account." },
};

function ConnectorCard({
  provider,
  onDisconnect,
}: {
  provider: ProviderDto;
  onDisconnect: (id: string) => void;
}) {
  const brand = BRAND[provider.id];
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl text-white ${brand.color}`}
        >
          <Mail className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <CardTitle className="text-base">{provider.label}</CardTitle>
          <CardDescription>{brand.blurb}</CardDescription>
        </div>
        {provider.connected ? (
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-600">
            Connected
          </Badge>
        ) : provider.configured ? (
          <Badge variant="outline">Not connected</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Not configured
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <Separator className="mb-4" />
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm text-muted-foreground">
            {provider.connected
              ? `Connected as ${provider.accountEmail ?? "unknown account"}`
              : provider.configured
                ? "You will be redirected to sign in and authorize access."
                : "Your administrator needs to set the OAuth credentials first (see .env.example)."}
          </p>
          {provider.connected ? (
            <Button variant="outline" size="sm" onClick={() => onDisconnect(provider.id)}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" disabled={!provider.configured} asChild={provider.configured}>
              {provider.configured ? (
                <a href={`/api/connections/${provider.id}/start`}>Connect</a>
              ) : (
                <span>Connect</span>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectorsInner() {
  const [providers, setProviders] = useState<ProviderDto[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ providers: ProviderDto[] }>("/api/connections");
      setProviders(data.providers);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load connectors.");
    }
  }, []);

  useEffect(() => {
    void load();
    // Surface the OAuth callback result once.
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status) {
      const provider = params.get("provider");
      if (status === "connected") toast.success(`${provider === "outlook" ? "Outlook" : "Gmail"} connected.`);
      else toast.error("Could not connect the service. Please try again.");
      window.history.replaceState({}, "", "/connectors");
    }
  }, [load]);

  async function disconnect(id: string) {
    try {
      await api(`/api/connections/${id}`, { method: "DELETE" });
      toast.success("Disconnected.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Connectors</h1>
        <p className="text-sm text-muted-foreground">
          Link external services to your account. Outlook and Gmail are supported.
        </p>
      </div>

      {!providers ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((p) => (
            <ConnectorCard key={p.id} provider={p} onDisconnect={disconnect} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConnectorsPage() {
  return (
    <Suspense>
      <ConnectorsInner />
    </Suspense>
  );
}
