"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { CalendarSearch, ExternalLink, FilePen, Keyboard, Plus, Repeat, Search, Ticket } from "lucide-react";

import { onOpenCommandMenu } from "components/Admin/shell/command-bus";
import { CommandGroup, CommandRow, matchEntry } from "components/Admin/shell/command-items";
import type { CommandEntry } from "components/Admin/shell/commands";
import { guardedPush } from "components/Admin/shell/navigation-guard";
import { openShortcutSheet, useShortcuts } from "components/Admin/shell/shortcuts";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "components/shared/ui/dialog";
import { Kbd } from "components/shared/ui/kbd";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";

import { openNewEvent } from "../events/NewEventDialog";
import { usePanel } from "./context";
import { PANEL_NAV, panelHref } from "./nav";

const STATUS = { draft: "Borrador", published: "Publicado", cancelled: "Cancelado" } as const;

/**
 * ⌘K in the organizer panel: start an event, go to any page, open an event by name, switch
 * community. The admin palette's rows and matching, without its event-day machinery.
 */
export function PanelCommandMenu() {
  const router = useRouter();
  const { communities, current } = usePanel();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useShortcuts([
    {
      id: "shell.command-menu",
      keys: "mod+k",
      label: "Buscar o ejecutar",
      group: "General",
      allowInInputs: true,
      run: () => setOpen((value) => !value),
    },
  ]);

  useEffect(
    () =>
      onOpenCommandMenu((query) => {
        setSearch(query ?? "");
        setOpen(true);
      }),
    []
  );

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const events = useQuery(
    orpc.events.list.queryOptions({
      input: open && current ? { communityId: current.id } : skipToken,
      staleTime: 30_000,
    })
  );

  const slug = current?.slug ?? null;
  const actions: CommandEntry[] = !slug
    ? []
    : [
        {
          id: "action:new-event",
          title: "Nuevo evento",
          icon: Plus,
          tone: "text-primary",
          shortcut: "c",
          keywords: ["crear", "meetup", "borrador"],
          perform: { type: "run", run: openNewEvent },
        },
        {
          id: "action:find-date",
          title: "Buscar fecha",
          icon: CalendarSearch,
          keywords: ["reservar", "calendario", "choques"],
          perform: { type: "navigate", href: panelHref(slug, "calendario") },
        },
        {
          id: "action:profile",
          title: "Ver el perfil público",
          icon: ExternalLink,
          keywords: ["comunidad", "página"],
          perform: { type: "external", href: `/comunidad/${slug}` },
        },
        {
          id: "action:shortcuts",
          title: "Atajos de teclado",
          icon: Keyboard,
          shortcut: "?",
          perform: { type: "run", run: openShortcutSheet },
        },
      ];

  const navigation: CommandEntry[] = !slug
    ? []
    : PANEL_NAV.flatMap((group) =>
        group.items.map((item) => ({
          id: `nav:${item.key}`,
          title: item.title,
          subtitle: group.label,
          icon: item.icon,
          shortcut: item.go ? `g ${item.go}` : undefined,
          perform: { type: "navigate" as const, href: panelHref(slug, item.path) },
        }))
      );

  const eventEntries: CommandEntry[] = !slug
    ? []
    : (events.data ?? []).map((event) => ({
        id: `event:${event.id}`,
        title: event.name,
        subtitle: event.dateChosen ? shortWhen(event.startDate) : "Sin fecha",
        hint: STATUS[event.status],
        icon: event.status === "draft" ? FilePen : Ticket,
        keywords: ["evento"],
        perform: {
          type: "navigate",
          href: panelHref(slug, event.status === "draft" ? `eventos/${event.id}/editar` : `eventos/${event.id}`),
        },
      }));

  const switches: CommandEntry[] = communities
    .filter((community) => community.id !== current?.id)
    .map((community) => ({
      id: `community:${community.id}`,
      title: current ? `Cambiar a ${community.name}` : community.name,
      icon: Repeat,
      keywords: ["comunidad", community.slug],
      perform: { type: "navigate", href: panelHref(community.slug) },
    }));

  const run = (entry: CommandEntry) => {
    const { perform } = entry;
    setOpen(false);
    if (perform.type === "navigate") guardedPush(router, perform.href);
    else if (perform.type === "external") window.open(perform.href, "_blank", "noopener,noreferrer");
    // Let the palette close first: a dialog opened by the action would fight its focus trap.
    else if (perform.type === "run") setTimeout(() => void perform.run(), 0);
  };
  const searching = search.trim().length >= 2;
  const groups = [
    { heading: "Acciones", entries: actions },
    { heading: "Ir a", entries: navigation },
    { heading: "Eventos", entries: searching ? eventEntries : [] },
    // Site staff see every community: only when they look for one
    { heading: "Comunidades", entries: searching || switches.length <= 5 ? switches : [] },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[calc(var(--admin-viewport-top,0px)+max(0.75rem,env(safe-area-inset-top)))] max-w-[660px] translate-y-0 gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 sm:top-[max(4rem,12vh)] sm:p-0 [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">Buscar o ejecutar</DialogTitle>
        {/* No Ctrl+J/K/N/P list moves: cmdk would swallow Ctrl+K, so on Windows and Linux the palette couldn't close or reopen */}
        <CommandPrimitive loop className="flex flex-col" filter={matchEntry} vimBindings={false}>
          <div className="flex h-[52px] items-center gap-2.5 border-b border-border px-4">
            <Search aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              autoFocus
              className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-hidden placeholder:text-faint sm:text-[15px] pointer-coarse:text-base"
              enterKeyHint="go"
              placeholder="Buscá un evento, una página… o escribí un comando"
              spellCheck={false}
              value={search}
              onValueChange={setSearch}
            />
            <Kbd className="shrink-0 pointer-coarse:hidden">esc</Kbd>
            {/* No Esc on a touchscreen, and the keyboard leaves little backdrop to tap. */}
            <DialogClose asChild>
              <Button className="-mr-2 hidden shrink-0 pointer-coarse:inline-flex" size="sm" variant="ghost">
                Cerrar
              </Button>
            </DialogClose>
          </div>

          <CommandPrimitive.List className="max-h-[min(440px,60vh)] scroll-py-2 scrollbar-thin overflow-y-auto overscroll-contain pb-2 max-sm:max-h-[calc(var(--admin-viewport-height,100dvh)-max(0.75rem,env(safe-area-inset-top))-52px-0.75rem)]">
            <CommandPrimitive.Empty className="py-10 text-center text-ui text-muted-foreground">
              Nada coincide con «{search}».
            </CommandPrimitive.Empty>
            {groups.map((group) =>
              group.entries.length > 0 ? (
                <CommandGroup key={group.heading} heading={group.heading}>
                  {group.entries.map((entry) => (
                    <CommandRow key={entry.id} entry={entry} onRun={run} />
                  ))}
                </CommandGroup>
              ) : null
            )}
          </CommandPrimitive.List>

          <div className="flex h-10 items-center gap-4 border-t border-border bg-background/60 px-4 text-meta text-faint max-sm:hidden">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              navegar
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>⏎</Kbd>
              ejecutar
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Kbd>?</Kbd>
              atajos
            </span>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
