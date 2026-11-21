"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  ChevronsUpDown,
  Ellipsis,
  ExternalLink,
  Flag,
  Keyboard,
  LogOut,
  Search,
  ShieldCheck,
} from "lucide-react";

import { signOut, useSession } from "app/lib/auth-client";
import { cn } from "app/lib/utils";
import { openCommandMenu } from "components/Admin/shell/command-bus";
import {
  KeyHint,
  openShortcutSheet,
  setSingleKeyShortcuts,
  useSingleKeyShortcuts,
} from "components/Admin/shell/shortcuts";
import { Meter } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { StatusDot } from "components/Admin/ui/status";
import { CommunityMark } from "components/shared/CommunityMark";
import { Button } from "components/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
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
import { dateParts } from "lib/community/time";
import { plural } from "lib/organizar/words";
import type { PanelSummary } from "lib/orpc/panel/schemas";

import { usePanel, usePanelSummary } from "./context";
import { PANEL_NAV, PANEL_ROOT, activePanelItem, panelHref, type PanelNavKey } from "./nav";

/** "3 eventos · próximo jue 19", under the community's name. */
const aheadLine = ({ ahead }: PanelSummary) => {
  if (ahead.length === 0) return "Sin eventos por delante";
  const { weekday, day } = dateParts(ahead[0].startDate);

  return `${plural(ahead.length, "evento", "eventos")} · próximo ${weekday} ${day}`;
};

/** The right edge of a nav row: a mono count, or a yellow-outline "needs you" badge. */
function NavExtra({ itemKey, summary }: { itemKey: PanelNavKey; summary: PanelSummary | undefined }) {
  if (!summary) return null;
  const count = (value: number) =>
    value ? <span className="ml-auto font-terminal text-2xs text-faint tabular-nums">{value}</span> : null;
  // The number shows; what it counts is read out
  const alert = (value: number, what: string) =>
    value > 0 ? (
      <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-primary/25 bg-primary-surface px-1 font-terminal text-[10.5px] text-primary tabular-nums">
        {value}
        <span className="sr-only"> {what}</span>
      </span>
    ) : null;
  const invitations = summary.invitations.length;
  const polls = summary.polls.length;
  // Only what needs an answer, as in Para hacer: a host's reply is news on Inicio, not a to-do
  const waiting = summary.venueRequests.filter((request) => request.status === "pending").length;
  const extras: Partial<Record<PanelNavKey, ReactNode>> = {
    inicio: alert(invitations, invitations === 1 ? "invitación a coorganizar" : "invitaciones a coorganizar"),
    eventos: count(summary.ahead.length),
    encuestas: alert(polls, polls === 1 ? "votación espera su respuesta" : "votaciones esperan su respuesta"),
    espacios: alert(waiting, waiting === 1 ? "pedido de espacio sin respuesta" : "pedidos de espacio sin respuesta"),
  };

  return <>{extras[itemKey] ?? null}</>;
}

const OPEN_DOOR = { none: "Entrada libre", external: "Inscripción externa" } as const;

/** "● PRÓXIMO · JUE 19 NOV", its name and "48 de 60 lugares" with a meter, opening its dashboard. */
function NextEventCard({ slug, summary, onOpen }: { slug: string; summary: PanelSummary; onOpen: () => void }) {
  const next = summary.ahead[0];
  const card = "block rounded-[10px] border border-border bg-card p-3 shadow-edge transition-colors hover:border-input";
  if (!next) {
    return (
      <Link className={card} href={panelHref(slug, "calendario")} onClick={onOpen}>
        <div className="flex items-center gap-2">
          <StatusDot tone="idle" />
          <span className="font-terminal text-2xs tracking-[0.14em] text-muted-foreground uppercase">
            Nada por delante
          </span>
        </div>
        <p className="mt-2 text-meta text-muted-foreground">Reservá una fecha: todas las comunidades la ven.</p>
      </Link>
    );
  }
  const { weekday, day, month } = dateParts(next.startDate);
  const seats = summary.nextSeats;

  return (
    <Link className={card} href={panelHref(slug, `eventos/${next.id}`)} onClick={onOpen}>
      <div className="flex items-center gap-2">
        <StatusDot tone="brand" />
        <span className="font-terminal text-2xs tracking-[0.14em] text-primary uppercase tabular-nums">
          Próximo · {weekday} {day} {month}
        </span>
      </div>
      <p className="mt-2 truncate text-meta text-foreground">{next.name}</p>
      {next.registration === "none" || next.registration === "external" ? (
        <p className="text-2xs text-muted-foreground">{OPEN_DOOR[next.registration]}</p>
      ) : seats ? (
        <>
          <p className="font-terminal text-2xs text-muted-foreground tabular-nums">
            {/* Seats taken (with +1s and offers): the words every surface uses for this number */}
            {next.capacity
              ? `${seats.taken} de ${next.capacity} lugares`
              : plural(seats.taken, "lugar ocupado", "lugares ocupados")}
            {seats.waiting ? ` · ${seats.waiting} en espera` : ""}
          </p>
          {next.capacity ? (
            <Meter
              className="mt-2"
              label="Lugares ocupados"
              max={next.capacity}
              tone={seats.taken >= next.capacity ? "warning" : "primary"}
              value={seats.taken}
            />
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

function CommunitySwitcher() {
  const { communities, current } = usePanel();
  const summary = usePanelSummary();
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          className="h-12 gap-2.5 px-1.5 group-data-[collapsible=icon]:!p-0.5 data-[state=open]:bg-raised"
          size="lg"
        >
          {current ? (
            <CommunityMark community={current} size={30} />
          ) : (
            <span className="grid size-[30px] place-items-center rounded-[7px] border border-input bg-raised">
              <Flag className="size-4 text-muted-foreground" />
            </span>
          )}
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-ui font-semibold text-foreground">{current?.name ?? "Organizá"}</span>
            <span className="truncate font-terminal text-2xs text-muted-foreground tabular-nums">
              {!current ? "Elegí una comunidad" : summary.data ? aheadLine(summary.data) : current.roleLabel}
            </span>
          </span>
          <ChevronsUpDown className="ml-auto size-4 text-faint" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="font-terminal text-[10.5px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
          Tus comunidades
        </DropdownMenuLabel>
        {communities.map((community) => (
          <DropdownMenuItem key={community.id} asChild>
            <Link href={panelHref(community.slug)} onClick={close}>
              <CommunityMark community={community} size={20} />
              <span className="truncate">{community.name}</span>
              {community.id === current?.id ? <Check className="ml-auto !text-primary" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`${PANEL_ROOT}/reclamar`} onClick={close}>
            <Flag />
            Organizar otra comunidad
          </Link>
        </DropdownMenuItem>
        {current ? (
          <DropdownMenuItem asChild>
            <Link href={`/comunidad/${current.slug}`} target="_blank">
              <ExternalLink />
              Ver el perfil público
            </Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserRow() {
  const { data: session } = useSession();
  const { isStaff, current } = usePanel();
  const mounted = useMounted();
  const singleKeys = useSingleKeyShortcuts();
  const user = session?.user;
  if (!mounted || !user) return <div aria-hidden className="h-11" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="h-11 gap-2.5 px-1.5 group-data-[collapsible=icon]:!p-0.5" size="lg">
          <PersonAvatar image={user.image} name={user.name} size={28} />
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-meta font-medium text-foreground">{user.name}</span>
            <span className="truncate text-2xs text-muted-foreground">
              {isStaff ? "Staff del sitio" : current ? `${current.roleLabel} · ${current.name}` : "Organizador"}
            </span>
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
        {isStaff ? (
          <DropdownMenuItem asChild>
            <Link href="/admin/communities">
              <ShieldCheck />
              Pedidos de organizadores
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {/* Keyboard users who trip over them can turn them off here too (WCAG 2.1.4); not on touch */}
        <DropdownMenuCheckboxItem
          checked={singleKeys}
          className="pointer-coarse:hidden"
          onCheckedChange={setSingleKeyShortcuts}
          onSelect={(event) => event.preventDefault()}
        >
          Atajos de una tecla
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem className="pointer-coarse:hidden" onSelect={() => setTimeout(openShortcutSheet, 0)}>
          <Keyboard />
          Ver los atajos
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

export function PanelSidebar() {
  const pathname = usePathname();
  const { current } = usePanel();
  const summary = usePanelSummary();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const active = activePanelItem(pathname, current?.slug ?? null);
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-2 p-1.5 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <CommunitySwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
        <button
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-ui text-muted-foreground transition-colors group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:border-input hover:text-foreground pointer-coarse:h-10"
          type="button"
          onClick={() => {
            close();
            openCommandMenu();
          }}
        >
          <Search aria-hidden className="size-[15px] shrink-0 text-muted-foreground" />
          <span className="truncate group-data-[collapsible=icon]:hidden">Buscar o ejecutar…</span>
          {/* ⌘ on a Mac, Ctrl elsewhere, nothing on a touchscreen */}
          <span className="ml-auto group-data-[collapsible=icon]:hidden">
            <KeyHint keys="mod+k" />
          </span>
          <span className="sr-only">Abrir la paleta de comandos</span>
        </button>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin gap-0 pt-2">
        {current
          ? PANEL_NAV.map((group) => (
              <SidebarGroup key={group.key} className="py-1.5">
                {group.label ? (
                  <SidebarGroupLabel className="h-6 px-2 font-terminal text-[10.5px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                    {group.label}
                  </SidebarGroupLabel>
                ) : null}
                <SidebarGroupContent>
                  <SidebarMenu className="gap-px">
                    {group.items.map((item) => {
                      const isActive = active?.key === item.key;

                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            asChild
                            className={cn(
                              "relative h-[30px] gap-2.5 rounded-[7px] px-2 text-ui text-subtle hover:bg-raised hover:text-foreground data-[active=true]:bg-raised data-[active=true]:font-normal data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_hsl(var(--border))] pointer-coarse:h-10",
                              state === "collapsed" && "justify-center"
                            )}
                            isActive={isActive}
                            tooltip={item.title}
                          >
                            <Link href={panelHref(current.slug, item.path)} onClick={close}>
                              {isActive ? (
                                <span
                                  aria-hidden
                                  className="absolute inset-y-[7px] -left-1.5 w-0.5 rounded-full bg-primary group-data-[collapsible=icon]:hidden"
                                />
                              ) : null}
                              <item.icon
                                className={cn("!size-4", isActive ? "text-primary" : "text-muted-foreground")}
                              />
                              <span className="truncate group-data-[collapsible=icon]:hidden">{item.title}</span>
                              <span className="contents group-data-[collapsible=icon]:hidden">
                                <NavExtra itemKey={item.key} summary={summary.data} />
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          : null}
      </SidebarContent>

      <SidebarFooter className="gap-1.5 p-1.5">
        {/* The card holds its room while it loads: the footer grew under the menu after the first paint. */}
        {current ? (
          <div className="group-data-[collapsible=icon]:hidden">
            {summary.data ? (
              <NextEventCard slug={current.slug} summary={summary.data} onOpen={close} />
            ) : summary.isError ? (
              <div
                className="flex items-center gap-2 rounded-[10px] border border-live/25 bg-live-surface/60 p-3"
                role="alert"
              >
                <p className="min-w-0 flex-1 text-meta text-foreground">No pudimos traer el próximo evento.</p>
                <Button
                  disabled={summary.isFetching}
                  size="xs"
                  variant="outline"
                  onClick={() => void summary.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            ) : (
              <Skeleton className="h-[88px] rounded-[10px]" />
            )}
          </div>
        ) : null}
        <SidebarMenu>
          <SidebarMenuItem>
            <UserRow />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail className="pointer-coarse:hidden" />
    </Sidebar>
  );
}
