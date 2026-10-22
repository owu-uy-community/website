"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cast, History, Inbox, MousePointerClick, StickyNote as NoteIcon, Star, Trash2, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { SwitchRow } from "components/Admin/panel";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { RelativeTime } from "components/Admin/ui/time";
import { ResourceWarningDialog } from "components/Meetups/OpenSpace/organisms/ResourceWarningDialog";
import { TALK_FORM_ID, TalkForm } from "components/Meetups/OpenSpace/organisms/talk-form/TalkForm";
import type { RoomWithResources } from "components/Meetups/OpenSpace/organisms/talk-form/types";
import type { TalkFormController } from "components/Meetups/OpenSpace/organisms/talk-form/use-talk-form";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Skeleton } from "components/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc, type Schedule, type StickyNote } from "lib/orpc";
import type { ActivityItem } from "lib/orpc/activity/router";
import { eventChannel } from "lib/realtime/channels";

import { slotPhase } from "./agenda-state";
import { PhaseBadge } from "./AgendaList";
import { firstName } from "./CompactNoteSurface";

export type InspectorTab = "charla" | "recientes" | "cambios";

/** Owy's own account (see create-owy-key.ts): its lines get the carpincho. */
const OWY_BOT_ID = "owy-bot";

function Actor({ actor }: { actor: ActivityItem["actor"] }) {
  if (actor?.id === OWY_BOT_ID) {
    return (
      <Image
        alt=""
        className="mt-px size-4 shrink-0 rounded-full bg-raised object-contain"
        height={16}
        src="/images/logos/carpincho.png"
        width={16}
      />
    );
  }
  if (!actor) return <span aria-hidden className="mx-[5px] mt-1.5 size-1.5 shrink-0 rounded-full bg-faint" />;

  return <PersonAvatar className="mt-px" image={actor.image} name={actor.name} size={16} />;
}

/** One line of the log: who, what (in their voice), when. Opens the talk when it's still on the board. */
function ActivityRow({ line, onSelect, gone = false }: { line: ActivityItem; onSelect?: () => void; gone?: boolean }) {
  const summary = line.actor ? line.summary : `${line.summary.charAt(0).toUpperCase()}${line.summary.slice(1)}`;
  const content = (
    <>
      <Actor actor={line.actor} />
      <span className="min-w-0 flex-1 text-subtle">
        {line.actor ? <span className="font-medium text-foreground">{firstName(line.actor.name)} </span> : null}
        {summary}
        {gone ? <span className="text-faint"> · ya no está en la grilla</span> : null}
      </span>
      <RelativeTime className="shrink-0 pt-px text-2xs" date={line.createdAt} />
    </>
  );

  if (!onSelect) {
    return <div className={cn("flex items-start gap-2 px-2 py-1.5 text-meta", gone && "opacity-60")}>{content}</div>;
  }

  return (
    <button
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-meta transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
      type="button"
      onClick={onSelect}
    >
      {content}
    </button>
  );
}

function LogSkeleton() {
  return (
    <div aria-hidden className="space-y-3 p-4">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-2">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

/** The talks that came in last, from anyone: staff, Owy, or a card photo. */
function RecentAdditions({
  eventId,
  onBoard,
  onSelect,
}: {
  eventId: string;
  onBoard: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  const query = useQuery(
    orpc.activity.list.queryOptions({ input: { eventId, entityType: "track", limit: 100 }, staleTime: 15_000 })
  );

  if (query.isPending) return <LogSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        compact
        className="m-3"
        retrying={query.isFetching}
        title="No se pudo cargar lo último"
        onRetry={() => void query.refetch()}
      />
    );
  }

  const added = query.data.filter((line) => line.verb === "track.created");
  if (added.length === 0) {
    return (
      <EmptyState
        compact
        description="Lo que agreguen el staff, Owy o el lector de fotos aparece acá."
        icon={Inbox}
        title="Todavía no entró ninguna charla"
      />
    );
  }

  return (
    <ul className="space-y-0.5 p-2">
      {added.map((line) => {
        const id = line.entityId;
        const here = id != null && onBoard.has(id);

        return (
          <li key={line.id}>
            <ActivityRow gone={!here} line={line} onSelect={here ? () => onSelect(id) : undefined} />
          </li>
        );
      })}
    </ul>
  );
}

/** Everything that happened to one talk, newest first. */
function TalkHistory({ eventId, trackId }: { eventId: string; trackId: string }) {
  const query = useQuery(
    orpc.activity.list.queryOptions({
      input: { eventId, entityType: "track", entityId: trackId, limit: 50 },
      staleTime: 15_000,
    })
  );

  if (query.isPending) return <LogSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        compact
        className="m-3"
        retrying={query.isFetching}
        title="No se pudo cargar el historial"
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.data.length === 0) {
    return (
      <EmptyState
        compact
        description="Lo que se haga con esta charla desde ahora queda anotado acá."
        icon={History}
        title="Sin cambios anotados"
      />
    );
  }

  return (
    <ul className="space-y-0.5 p-2">
      {query.data.map((line) => (
        <li key={line.id}>
          <ActivityRow line={line} />
        </li>
      ))}
    </ul>
  );
}

const pickATalk = (
  <EmptyState
    compact
    description="Tocá una tarjeta de la grilla para verla acá."
    icon={MousePointerClick}
    title="Elegí una charla"
  />
);

/**
 * The board's right panel (wide screens): the selected talk to edit, move, feature or put on the
 * screens, what came in lately, and the talk's history. Narrow screens edit in the sheet instead.
 */
export function AgendaInspector({
  eventId,
  tab,
  onTabChange,
  onClose,
  note,
  schedule,
  color,
  wall,
  isCast,
  isSaving,
  controller,
  rooms,
  roomsData,
  timeSlots,
  onBoard,
  onSelect,
  onDelete,
  onCast,
  onToggleKiosk,
}: {
  eventId: string;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onClose: () => void;
  /** The selected talk; null once it's gone (deleted here or elsewhere). */
  note: StickyNote | null;
  schedule: Schedule | undefined;
  color: string;
  wall: string | null;
  isCast: boolean;
  isSaving: boolean;
  /** The talk form, owned by the board so "Sugerir con IA" in the header can drive it. */
  controller: TalkFormController;
  rooms: string[];
  roomsData: RoomWithResources[];
  timeSlots: string[];
  /** Ids of the talks on the board, so a log line can open its talk. */
  onBoard: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onDelete: () => void;
  onCast: () => void;
  onToggleKiosk: () => void;
}) {
  const queryClient = useQueryClient();
  useRealtimeChannel(eventChannel(eventId, "ops"), (event) => {
    if (event === "activity") void queryClient.invalidateQueries({ queryKey: orpc.activity.list.key() });
  });

  const start = note?.timeSlot.split(" - ")[0];

  return (
    <aside
      aria-label="Detalle de la charla"
      className="flex w-[318px] shrink-0 flex-col border-l border-border bg-card"
      // Shortcuts skip keys typed into fields, but Esc while editing should still close the
      // panel (the board asks first when there are unsaved changes). An open menu takes it first.
      onKeyDown={(event) => {
        const field = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
        if (event.key !== "Escape" || event.defaultPrevented || !field) return;
        event.preventDefault();
        onClose();
      }}
    >
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        value={tab}
        onValueChange={(value) => onTabChange(value as InspectorTab)}
      >
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
          <TabsList>
            <TabsTrigger className="px-2" value="charla">
              <NoteIcon aria-hidden />
              Charla
            </TabsTrigger>
            <TabsTrigger className="px-2" value="recientes">
              <Inbox aria-hidden />
              Recientes
            </TabsTrigger>
            <TabsTrigger className="px-2" value="cambios">
              <History aria-hidden />
              Cambios
            </TabsTrigger>
          </TabsList>
          <Button aria-label="Cerrar el panel" className="ml-auto" size="icon-sm" variant="ghost" onClick={onClose}>
            <X />
          </Button>
        </div>

        <TabsContent className="mt-0 flex min-h-0 flex-1 flex-col" value="charla">
          {note ? (
            <>
              <div className="min-h-0 flex-1 scrollbar-thin space-y-5 overflow-y-auto overscroll-contain p-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="truncate font-terminal text-2xs tracking-[0.08em] text-muted-foreground uppercase tabular-nums">
                    {note.room} · {note.timeSlot.replace(" - ", " – ")}
                  </span>
                  {wall && schedule ? <PhaseBadge className="ml-auto" phase={slotPhase(schedule, wall)} /> : null}
                </div>

                <TalkForm
                  controller={controller}
                  note={note}
                  rooms={rooms}
                  roomsData={roomsData}
                  timeSlots={timeSlots}
                />

                <div className="space-y-1.5">
                  <SwitchRow
                    checked={Boolean(schedule?.highlightInKiosk)}
                    hint={`Destaca todo el bloque de las ${start}.`}
                    icon={Star}
                    id="inspector-kiosk"
                    label="Destacar en kiosco"
                    onCheckedChange={onToggleKiosk}
                  />
                  <button
                    aria-keyshortcuts="c"
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
                    type="button"
                    onClick={onCast}
                  >
                    <Cast
                      aria-hidden
                      className={cn("size-4 shrink-0", isCast ? "text-live-foreground" : "text-muted-foreground")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-ui font-medium text-foreground">
                        {isCast ? "Quitar de la pantalla" : "Mandar a la pantalla"}
                      </span>
                      {isCast ? (
                        <span className="flex items-center gap-1.5 text-meta text-live-foreground">
                          <StatusDot tone="live" />
                          Se está mostrando ahora
                        </span>
                      ) : null}
                    </span>
                    <Kbd aria-hidden>C</Kbd>
                  </button>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2.5">
                <Button
                  aria-label="Eliminar charla"
                  className="text-live-foreground hover:bg-live-surface hover:text-live-foreground"
                  disabled={isSaving}
                  size="sm"
                  variant="ghost"
                  onClick={onDelete}
                >
                  <Trash2 />
                  Eliminar
                </Button>
                {controller.isDirty ? (
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button disabled={isSaving} size="sm" variant="ghost" onClick={controller.discardChanges}>
                      Descartar
                    </Button>
                    <Button disabled={isSaving} form={TALK_FORM_ID} size="sm" type="submit">
                      {isSaving ? "Guardando…" : "Guardar"}
                    </Button>
                  </div>
                ) : (
                  <span className="ml-auto truncate font-terminal text-2xs text-muted-foreground">
                    guardado · <RelativeTime className="text-2xs" date={note.updatedAt} />
                  </span>
                )}
              </div>

              <ResourceWarningDialog
                confirmLabel="Guardar igual"
                issues={controller.resourceWarning}
                open={controller.resourceWarning.length > 0}
                onCancel={controller.dismissResourceWarning}
                onConfirm={controller.confirmResourceWarning}
              />
            </>
          ) : (
            pickATalk
          )}
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1 scrollbar-thin overflow-y-auto" value="recientes">
          <RecentAdditions eventId={eventId} onBoard={onBoard} onSelect={onSelect} />
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1 scrollbar-thin overflow-y-auto" value="cambios">
          {note ? <TalkHistory eventId={eventId} trackId={note.id} /> : pickATalk}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
