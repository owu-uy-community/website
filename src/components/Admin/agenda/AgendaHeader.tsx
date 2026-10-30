"use client";

import * as React from "react";
import { ArrowUpRight, LayoutGrid, List, Plus, Rows3, Settings2, Sparkles, StickyNote, Tv } from "lucide-react";

import { PageHeader } from "components/Admin/ui/page";
import { SearchInput } from "components/Meetups/OpenSpace/atoms/SearchInput";
import { CountdownControls } from "components/Meetups/OpenSpace/organisms/CountdownControls";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { Kbd } from "components/shared/ui/kbd";
import { Tabs, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/shared/ui/tooltip";

import type { AgendaView } from "./agenda-state";

export const VIEW_OPTIONS: { value: AgendaView; label: string; icon: typeof StickyNote }[] = [
  { value: "postit", label: "Post-it", icon: StickyNote },
  { value: "compact", label: "Compacta", icon: Rows3 },
  { value: "list", label: "Lista", icon: List },
];

/**
 * The board's title row: what's on it, how to see it, search, and its actions. The rarely used
 * ones (rooms and blocks, the kiosk, auto-highlight) live in the overflow menu.
 */
export function AgendaHeader({
  summary,
  view,
  onViewChange,
  search,
  onSearchChange,
  searchRef,
  ready,
  eventId,
  kioskHref,
  autoHighlight,
  onSuggest,
  onStructure,
  onNew,
}: {
  /** "21 charlas · 4 lugares libres". */
  summary: string;
  view: AgendaView;
  onViewChange: (view: AgendaView) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchRef: React.Ref<HTMLInputElement>;
  /** The grid has rooms and blocks: talks have somewhere to go. */
  ready: boolean;
  eventId: string;
  kioskHref?: string;
  autoHighlight: { enabled: boolean; disabled: boolean; toggle: () => void };
  onSuggest: () => void;
  onStructure: () => void;
  onNew: () => void;
}) {
  return (
    <PageHeader
      actions={
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button aria-label="Sugerir con IA" disabled={!ready} variant="outline" onClick={onSuggest}>
                <Sparkles />
                {/* Icon only until there's room for one row of controls, with the timer running too
                    (it widens to show the time): a laptop's header never jumps to two rows. A
                    tablet has no tooltip to explain the icon, so it keeps the words. */}
                <span className="hidden min-[1536px]:inline sm:pointer-coarse:inline">Sugerir con IA</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>La IA elige sala y bloque para la charla</TooltipContent>
          </Tooltip>
          <CountdownControls eventId={eventId} />
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button aria-label="Más opciones" size="icon" variant="outline">
                    <Settings2 />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Salas, kiosco y resaltado</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={onStructure}>
                <LayoutGrid />
                Salas y horarios
              </DropdownMenuItem>
              {kioskHref ? (
                <DropdownMenuItem asChild>
                  <a href={kioskHref} rel="noreferrer" target="_blank">
                    <Tv />
                    Abrir el kiosco
                    <ArrowUpRight className="ml-auto text-muted-foreground" />
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={autoHighlight.enabled}
                disabled={autoHighlight.disabled}
                onCheckedChange={autoHighlight.toggle}
                onSelect={(event) => event.preventDefault()}
              >
                <span className="flex flex-col">
                  Resaltado automático
                  <span className="text-meta text-muted-foreground">El kiosco destaca el bloque en curso</span>
                </span>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button aria-keyshortcuts="n" disabled={!ready} onClick={onNew}>
            <Plus />
            Charla
            <Kbd aria-hidden className="max-md:hidden">
              N
            </Kbd>
          </Button>
        </>
      }
      className="mb-0 items-center gap-y-2.5 border-b border-border px-4 py-3 md:px-5"
      meta={
        <>
          {/* Laptops need the row for the controls; the sidebar already counts the talks. */}
          <Badge className="font-terminal md:max-[1399px]:hidden" variant="secondary">
            {summary}
          </Badge>
          <Tabs value={view} onValueChange={(value) => onViewChange(value as AgendaView)}>
            <TabsList aria-label="Ver la agenda como">
              {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
                // Icons only on phones, each still a thumb wide.
                <TabsTrigger key={value} aria-label={label} className="max-sm:min-w-11" value={value}>
                  <Icon aria-hidden />
                  <span className="max-sm:hidden">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <SearchInput
            ref={searchRef}
            className="max-md:flex-1 min-[1400px]:w-[200px] md:w-[180px]"
            shortcut="/"
            value={search}
            onChange={onSearchChange}
          />
        </>
      }
      title="Agenda"
    />
  );
}
