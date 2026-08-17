"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2, PenLine, Radio, ShieldCheck } from "lucide-react";

import { orpc } from "lib/orpc";
import { useSession } from "app/lib/auth-client";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { cn } from "app/lib/utils";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { Skeleton } from "components/shared/ui/skeleton";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

const REALTIME_STATUS = {
  open: { text: "Conectado", dot: "bg-emerald-500" },
  connecting: { text: "Conectando…", dot: "bg-primary" },
  closed: { text: "Desconectado", dot: "bg-muted-foreground" },
} as const;

export default function SettingsClient() {
  const { data: session } = useSession();
  const communitiesQuery = useQuery(orpc.communities.list.queryOptions({ input: { includeInactive: true } }));
  // Subscribing to a lightweight channel keeps the status indicator honest.
  const { status } = useRealtimeChannel("settings:health", () => undefined);
  const realtime = REALTIME_STATUS[status];

  const user = session?.user;
  const role: string = (user as { role?: string } | undefined)?.role ?? "user";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Ajustes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Estado de la plataforma y tu cuenta</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck aria-hidden className="h-4 w-4 text-muted-foreground" />
              Cuenta
            </CardTitle>
            <CardDescription>Sesión actual</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <Row label="Nombre" value={user?.name ?? "—"} />
            <Row label="Email" value={<span className="font-terminal text-xs">{user?.email ?? "—"}</span>} />
            <Row
              label="Rol"
              value={
                <Badge className="font-normal" variant="outline">
                  {role === "admin" ? "Site admin" : "Usuario"}
                </Badge>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio aria-hidden className="h-4 w-4 text-muted-foreground" />
              Tiempo real
            </CardTitle>
            <CardDescription>WebSockets nativos (Vercel Functions)</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <Row
              label="Conexión"
              value={
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", realtime.dot)} />
                  {realtime.text}
                </span>
              }
            />
            <Row
              label="Transporte"
              value={<span className="font-terminal text-xs">{process.env.NODE_ENV === "development" ? "sidecar :3199" : "/api/realtime"}</span>}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 aria-hidden className="h-4 w-4 text-muted-foreground" />
              Comunidades
            </CardTitle>
            <CardDescription>Tenants de la plataforma</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {communitiesQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="divide-y divide-border">
                <Row label="Total" value={communitiesQuery.data?.length ?? 0} />
                <Row
                  label="Activas"
                  value={communitiesQuery.data?.filter((community) => community.isActive).length ?? 0}
                />
              </div>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/communities">
                Gestionar comunidades
                <ArrowUpRight />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PenLine aria-hidden className="h-4 w-4 text-muted-foreground" />
              Contenido del sitio OWU
            </CardTitle>
            <CardDescription>Landing, sponsors, speakers y ediciones pasadas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              El contenido editorial de owu.uy se administra con Keystatic. Solo disponible en desarrollo (usa el
              filesystem local).
            </p>
            <Button asChild size="sm" variant="outline">
              <a href="/keystatic" rel="noopener noreferrer" target="_blank">
                Abrir Keystatic
                <ArrowUpRight />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
