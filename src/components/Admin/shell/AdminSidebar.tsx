"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, ExternalLink, Keyboard, LogOut, Search } from "lucide-react";

import { signOut, useSession } from "app/lib/auth-client";
import { cn } from "app/lib/utils";
import { Meter } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { StatusDot } from "components/Admin/ui/status";
import { formatClock, formatDuration, useNow } from "components/Admin/ui/time";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { Kbd } from "components/shared/ui/kbd";
import { Skeleton } from "components/shared/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "components/shared/ui/sidebar";
import { useMounted } from "hooks/useMounted";
import { roleLabel } from "lib/authz/labels";
import type { ShellStatus } from "lib/orpc/shell/schemas";

import { openCommandMenu } from "./command-bus";
import { EventSwitcher } from "./EventSwitcher";
import { ADMIN_NAV, isNavItemActive, type AdminNavItem, type NavKey } from "./nav-config";
import { openShortcutSheet } from "./shortcuts";
import { useShell } from "./use-shell-status";
import { eventHref, normalizeAdminPath, useSelectedEvent } from "./use-selected-event";

/** The right edge of a nav row: a count, a status dot, or a "needs you" badge. */
function NavExtra({ item, status }: { item: AdminNavItem; status: ShellStatus | undefined }) {
  if (!status) return null;
  const { counts, live, phase, daysLeft } = status;
  const count = (value: number | null | undefined) =>
    value ? <span className="ml-auto font-terminal text-2xs text-faint tabular-nums">{value}</span> : null;
  const alert = (value: number, tone: "brand" | "live") =>
    value > 0 ? (
      <span
        className={cn(
          "ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 font-terminal text-[10.5px] tabular-nums",
          tone === "live"
            ? "border border-live/30 bg-live-surface text-live-foreground"
            : "border border-primary/25 bg-primary-surface text-primary"
        )}
      >
        {value}
      </span>
    ) : null;

  const extras: Partial<Record<NavKey, ReactNode>> = {
    hoy:
      phase === "live" ? (
        <span className="ml-auto flex items-center gap-1.5 font-terminal text-2xs text-live-foreground">
          <StatusDot pulse ring tone="live" />
          VIVO
        </span>
      ) : phase === "pre" ? (
        <span className="ml-auto font-terminal text-2xs text-primary tabular-nums">{daysLeft} d</span>
      ) : null,
    agenda: count(counts.talks),
    guion: count(counts.moments),
    staff: count(counts.tasks),
    asistentes: count(counts.attendees),
    comunicacion: alert(counts.unackedAnnouncements, "brand"),
    escenas: live?.onAir ? (
      <span className="ml-auto flex items-center gap-1.5 font-terminal text-2xs text-muted-foreground">
        <StatusDot tone="live" />
        al aire
      </span>
    ) : null,
    obs: live ? (
      <span className="ml-auto flex items-center">
        <StatusDot ring={live.obsStreaming} tone={live.obsStreaming ? "live" : live.obsConnected ? "ok" : "idle"} />
      </span>
    ) : null,
    pantallas:
      counts.screensTotal > 0 ? (
        <span className="ml-auto font-terminal text-2xs text-faint tabular-nums">
          {counts.screensOnline}/{counts.screensTotal}
        </span>
      ) : null,
    incidentes: alert(counts.openIncidents, counts.criticalIncidents > 0 ? "live" : "brand"),
  };

  return <>{extras[item.key] ?? null}</>;
}

/** "EN VIVO 16:42:18 · Bloque 2 · quedan 16 min" on the day, the countdown and prep before it. */
function FooterWidget({ status }: { status: ShellStatus }) {
  const now = useNow(1000);
  const timezone = status.event.timezone;
  const prepDone = status.prep.filter((item) => item.done).length;

  if (status.phase === "pre") {
    return (
      <div className="rounded-[10px] border border-border bg-card p-3 shadow-edge">
        <div className="flex items-center gap-2">
          <StatusDot tone="brand" />
          <span className="font-terminal text-2xs tracking-[0.14em] text-primary uppercase">
            {status.daysLeft === 0
              ? "Es hoy"
              : status.daysLeft === 1
                ? "Falta 1 día"
                : `Faltan ${status.daysLeft} días`}
          </span>
        </div>
        <div className="mt-2 text-meta text-foreground">
          Preparación{" "}
          <span className="text-muted-foreground">
            · {prepDone} de {status.prep.length} listos
          </span>
        </div>
        <Meter className="mt-2" label="Preparación" max={status.prep.length} value={prepDone} />
      </div>
    );
  }

  if (status.phase === "post") {
    return (
      <div className="rounded-[10px] border border-border bg-card p-3 shadow-edge">
        <div className="flex items-center gap-2">
          <StatusDot tone="idle" />
          <span className="font-terminal text-2xs tracking-[0.14em] text-muted-foreground uppercase">Terminó</span>
        </div>
        <div className="mt-2 text-meta text-muted-foreground">Encuesta, informe y agradecimientos en Hoy.</div>
      </div>
    );
  }

  const { current, next, driftMin } = status.clock;
  const nowClock = now ? formatClock(now, timezone, true) : "--:--:--";
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const nowMin = now ? toMin(formatClock(now, timezone)) + new Date(now).getSeconds() / 60 : 0;
  const left = current ? toMin(current.end) - nowMin : 0;
  const length = current ? Math.max(1, toMin(current.end) - toMin(current.start)) : 1;

  return (
    <div className="rounded-[10px] border border-border bg-card p-3 shadow-edge">
      <div className="flex items-center gap-2">
        <StatusDot pulse ring tone="live" />
        <span className="font-terminal text-2xs tracking-[0.14em] text-live-foreground">EN VIVO</span>
        <span className="ml-auto font-terminal text-meta text-foreground tabular-nums" suppressHydrationWarning>
          {nowClock}
        </span>
      </div>
      {current ? (
        <>
          <div className="mt-2 truncate text-meta text-foreground">
            {current.title}{" "}
            <span className="font-terminal text-muted-foreground tabular-nums">
              · {current.start} – {current.end}
            </span>
          </div>
          <Meter
            className="mt-2"
            max={length}
            tone={left < 0 ? "warning" : "primary"}
            value={length - Math.max(0, left)}
          />
          <div className="mt-2 flex items-center justify-between gap-2 text-2xs text-muted-foreground">
            <span className="whitespace-nowrap">
              {left < 0 ? (
                <span className="text-warning-foreground">se pasó {formatDuration(-left * 60_000)}</span>
              ) : (
                <>quedan {formatDuration(left * 60_000)}</>
              )}
              {driftMin ? (
                <span className={driftMin > 0 ? "text-warning-foreground" : "text-success-foreground"}>
                  {" "}
                  · {driftMin > 0 ? "+" : "−"}
                  {Math.abs(driftMin)}
                </span>
              ) : null}
            </span>
            {next ? <span className="truncate">Sigue: {next.title}</span> : null}
          </div>
        </>
      ) : (
        <div className="mt-2 truncate text-meta text-muted-foreground">
          {next ? `Sigue: ${next.title} · ${next.start}` : "Nada programado ahora"}
        </div>
      )}
    </div>
  );
}

function UserRow({ status }: { status: ShellStatus | undefined }) {
  const { data: session } = useSession();
  const mounted = useMounted();
  const user = session?.user;
  if (!mounted || !user) return <div aria-hidden className="h-11" />;
  const role = status?.me.siteAdmin
    ? "Staff del sitio"
    : status?.me.role
      ? `${roleLabel(status.me.role)} · ${status.event.communityName}`
      : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="h-11 gap-2.5 px-1.5 group-data-[collapsible=icon]:!p-0.5" size="lg">
          <PersonAvatar image={user.image} name={user.name} size={28} />
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-meta font-medium text-foreground">{user.name}</span>
            <span className="truncate text-2xs text-muted-foreground">{role}</span>
          </span>
          <Ellipsis className="ml-auto size-4 text-faint" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" side="top">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/" target="_blank">
            <ExternalLink />
            Ver el sitio
          </Link>
        </DropdownMenuItem>
        {/* Keyboard shortcuts mean nothing to a finger. */}
        <DropdownMenuItem className="pointer-coarse:hidden" onSelect={() => setTimeout(openShortcutSheet, 0)}>
          <Keyboard />
          Atajos de teclado
          <Kbd className="ml-auto">?</Kbd>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-live-foreground focus:text-live-foreground" onSelect={() => signOut()}>
          <LogOut className="!text-live-foreground" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { scope, communitySlug } = useSelectedEvent();
  const { status } = useShell();
  const { state, isMobile, setOpenMobile } = useSidebar();
  // Active-state matching works on the canonical href, with the community
  // segment stripped from the current path.
  const normalizedPath = normalizeAdminPath(pathname, communitySlug);
  const siteAdmin = status?.me.siteAdmin ?? true;
  // Community staff get their day first; the planning pages are site staff only.
  const ordered = siteAdmin
    ? ADMIN_NAV
    : [...ADMIN_NAV.filter((group) => group.key === "day"), ...ADMIN_NAV.filter((group) => group.key !== "day")];
  const groups = ordered
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => siteAdmin || item.audience === "staff"),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-2 p-1.5 pt-2">
        <EventSwitcher />
        <button
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-ui text-faint transition-colors group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:border-input hover:text-muted-foreground pointer-coarse:h-10"
          type="button"
          onClick={() => {
            if (isMobile) setOpenMobile(false);
            openCommandMenu();
          }}
        >
          <Search aria-hidden className="size-[15px] shrink-0 text-muted-foreground" />
          <span className="truncate group-data-[collapsible=icon]:hidden">Buscar o ejecutar…</span>
          <span className="ml-auto flex gap-0.5 group-data-[collapsible=icon]:hidden pointer-coarse:hidden">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
          <span className="sr-only">Abrir la paleta de comandos</span>
        </button>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin gap-0 pt-2">
        {groups.map((group) => (
          <SidebarGroup key={group.key} className="py-1.5">
            {group.label ? (
              <SidebarGroupLabel className="h-6 px-2 font-terminal text-[10.5px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                {group.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {group.items.map((item) => {
                  const active = isNavItemActive(normalizedPath, item);
                  // Event-scoped links live under the community's path and
                  // carry the event selection, so switching pages never
                  // silently drops back to another tenant or event.
                  const href = item.scoped ? eventHref(scope, item.href) : item.href;

                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        asChild
                        className={cn(
                          "relative h-[30px] gap-2.5 rounded-[7px] px-2 text-ui text-subtle hover:bg-raised hover:text-foreground data-[active=true]:bg-raised data-[active=true]:font-normal data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_hsl(var(--border))] pointer-coarse:h-10",
                          state === "collapsed" && "justify-center"
                        )}
                        isActive={active}
                        tooltip={item.title}
                      >
                        <Link href={href} onClick={() => isMobile && setOpenMobile(false)}>
                          {active ? (
                            <span
                              aria-hidden
                              className="absolute inset-y-[7px] -left-1.5 w-0.5 rounded-full bg-primary group-data-[collapsible=icon]:hidden"
                            />
                          ) : null}
                          <item.icon className={cn("!size-4", active ? "text-primary" : "text-muted-foreground")} />
                          <span className="truncate group-data-[collapsible=icon]:hidden">{item.title}</span>
                          <span className="contents group-data-[collapsible=icon]:hidden">
                            <NavExtra item={item} status={status} />
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-1.5 p-1.5">
        {/* The card and the user row hold their room while they load: the footer grew under the
            menu after the first paint. */}
        <div className="group-data-[collapsible=icon]:hidden">
          {status ? <FooterWidget status={status} /> : <Skeleton className="h-[88px] rounded-[10px]" />}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserRow status={status} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail className="pointer-coarse:hidden" />
    </Sidebar>
  );
}
