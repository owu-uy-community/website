"use client";

import type React from "react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { matchMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Search } from "lucide-react";

import { openCommandMenu } from "components/Admin/shell/command-bus";
import { HEADER_ACTIONS_ID } from "components/Admin/shell/HeaderActions";
import { KeyHint, ShortcutListener, ShortcutSheet, useShortcuts } from "components/Admin/shell/shortcuts";
import { ConnectionPill } from "components/Admin/ui/status";
import { NewEventDialog, openNewEvent } from "components/organizar/events/NewEventDialog";
import { Button } from "components/shared/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "components/shared/ui/sidebar";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc/client";
import { eventChannel } from "lib/realtime/channels";

import { PanelProvider, usePanel, usePanelSummary, type PanelCommunity } from "./context";
import { LAST_COMMUNITY_COOKIE, PANEL_NAV_ITEMS, activePanelItem, panelHref } from "./nav";
import { PanelCommandMenu } from "./PanelCommandMenu";
import { PanelSidebar } from "./PanelSidebar";
import { PanelTabBar } from "./PanelTabBar";
import { TodoBell } from "./TodoBell";

/** Pages where "Nuevo evento" is the one yellow action; the others bring their own. */
const NEW_EVENT_PAGES = new Set(["inicio", "calendario", "eventos"]);

function Breadcrumbs() {
  const pathname = usePathname();
  const { current } = usePanel();
  const item = activePanelItem(pathname, current?.slug ?? null);

  return (
    <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1.5 text-ui">
      {current ? (
        <>
          <Link
            className="truncate text-muted-foreground hover:text-foreground max-sm:hidden"
            href={panelHref(current.slug)}
          >
            {current.name}
          </Link>
          {item && item.key !== "inicio" ? (
            <>
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-faint max-sm:hidden" />
              <span className="truncate text-foreground">{item.title}</span>
            </>
          ) : (
            <span className="truncate text-foreground sm:hidden">{current.name}</span>
          )}
        </>
      ) : (
        <span className="text-foreground">Organizá</span>
      )}
    </nav>
  );
}

/** Right of the header: live status, the bell, ⌘K on touch, and "Nuevo evento" where it leads. */
function HeaderTools({ live }: { live: boolean }) {
  const pathname = usePathname();
  const { current } = usePanel();
  const item = activePanelItem(pathname, current?.slug ?? null);
  const leads = Boolean(
    current && item && NEW_EVENT_PAGES.has(item.key) && pathname === panelHref(current.slug, item.path)
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* Only listening when an event is ahead; with nothing to listen to the pill would say "Sin conexión" */}
      {live ? <ConnectionPill /> : null}
      <TodoBell />
      {/* Phones, and any touchscreen: a tablet's sidebar may be folded away, and there's no ⌘K. */}
      <Button
        aria-label="Buscar o ejecutar"
        className="md:hidden pointer-coarse:inline-flex"
        size="icon-sm"
        variant="ghost"
        onClick={() => openCommandMenu()}
      >
        <Search />
      </Button>
      {/* Phones have the tab bar's + */}
      {leads ? (
        <Button className="max-md:hidden" size="sm" onClick={openNewEvent}>
          <Plus />
          Nuevo evento
          <KeyHint keys="c" />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The panel's keyboard map and freshness: "G" then a letter jumps to a section, `c` starts an
 * event, the last community used opens next time, and the summary (sidebar, bell, Inicio) reads
 * again after any change made here and whenever the next event's sign-ups move.
 */
function PanelEffects({ nextEventId }: { nextEventId: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { current } = usePanel();

  useEffect(() => {
    if (current) document.cookie = `${LAST_COMMUNITY_COOKIE}=${current.slug}; path=/; max-age=31536000; samesite=lax`;
  }, [current]);

  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "success") return;
        // Autosave fires every few seconds while typing: the wizard's other steps cover what it changes
        if (matchMutation({ mutationKey: orpc.events.save.key() }, event.mutation)) return;
        void queryClient.invalidateQueries({ queryKey: orpc.panel.summary.key() });
      }),
    [queryClient]
  );

  useRealtimeChannel(nextEventId ? eventChannel(nextEventId, "ops") : null, () => {
    void queryClient.invalidateQueries({ queryKey: orpc.panel.summary.key() });
  });

  useShortcuts(
    current
      ? [
          ...PANEL_NAV_ITEMS.filter((item) => item.go).map((item) => ({
            id: `panel.${item.key}`,
            keys: `g ${item.go}`,
            label: `Ir a ${item.title}`,
            group: "Navegación",
            run: () => router.push(panelHref(current.slug, item.path)),
          })),
          { id: "panel.new-event", keys: "c", label: "Nuevo evento", group: "Eventos", run: openNewEvent },
        ]
      : []
  );

  return null;
}

function Chrome({ children }: { children: React.ReactNode }) {
  const { current } = usePanel();
  const summary = usePanelSummary();
  const nextEventId = summary.data?.ahead[0]?.id ?? null;

  return (
    <>
      <PanelSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-40 flex h-[calc(46px+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border bg-background pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
          <SidebarTrigger className="-ml-0.5 size-7 shrink-0 text-muted-foreground hover:text-foreground" />
          <span aria-hidden className="h-4 w-px shrink-0 bg-input" />
          <Breadcrumbs />
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2" id={HEADER_ACTIONS_ID} />
          <HeaderTools live={nextEventId !== null} />
        </header>
        <div className="flex min-w-0 flex-1 scrollbar-thin flex-col md:min-h-0 md:overflow-y-auto">
          <main className="min-w-0 flex-1 pb-(--admin-tabbar-h,0px)">{children}</main>
        </div>
      </SidebarInset>
      <PanelTabBar />
      <PanelCommandMenu />
      {current ? <NewEventDialog key={current.id} community={current} /> : null}
      <ShortcutSheet />
      <ShortcutListener />
      <PanelEffects nextEventId={nextEventId} />
    </>
  );
}

/**
 * The organizer panel's frame: the OWU Ops shell (same tokens through `data-admin-shell`, inset
 * sidebar, header, phone tab bar, ⌘K), without the event-day machinery of the admin.
 */
export function PanelShell({
  communities,
  isStaff,
  defaultOpen = true,
  children,
}: {
  communities: PanelCommunity[];
  isStaff: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PanelProvider value={{ communities, isStaff }}>
      <SidebarProvider className="bg-app bg-grain" data-admin-shell="" defaultOpen={defaultOpen}>
        <Chrome>{children}</Chrome>
      </SidebarProvider>
    </PanelProvider>
  );
}
