"use client";

import type * as React from "react";
import { useState } from "react";
import Link from "next/link";
import type { UseQueryResult } from "@tanstack/react-query";
import { Megaphone, QrCode, ScanLine } from "lucide-react";

import { MicroLabel, Panel } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { clockTime } from "lib/community/time";
import type { EditableEvent, EventStats } from "lib/orpc/events/schemas";

import { usePanel } from "../shell/context";
import { AgendaPanel } from "./AgendaPanel";
import { DoorTab } from "./DoorTab";
import { Composer } from "./EmailsTab";
import type { Tab } from "./EventDashboard";
import type { EventInput } from "./save";

/** What a change of room usually says; the organizer fills in the blanks. */
const roomChanged = (event: EditableEvent) => ({
  subject: `Cambió la sala de «${event.name}»`,
  body: "Hola: al final estamos en otra sala. Ahora es en … (piso …). Si ya llegaste, te esperamos ahí.",
});

/**
 * The day, from an hour before until two hours after the end: the door is the one yellow button,
 * the count of who's in updates live, then the agenda with what's on now and the door's tools.
 */
export function DayView({
  base,
  input,
  event,
  stats,
  onGo,
}: {
  base: string;
  input: EventInput;
  event: EditableEvent;
  stats: UseQueryResult<EventStats>;
  eventbrite?: React.ReactNode;
  onGo: (tab: Tab, anchor?: string) => void;
}) {
  const { can } = usePanel();
  const [telling, setTelling] = useState(false);
  const data = stats.data;
  const signUp = event.registration === "owu" || event.registration === "eventbrite";

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <MicroLabel>Adentro</MicroLabel>
          <p
            className="font-terminal text-[40px] leading-[48px] font-semibold text-foreground tabular-nums"
            aria-live="polite"
          >
            {data ? (
              <>
                {data.checkedIn}
                <span className="text-[24px] text-muted-foreground"> / {data.attending} adentro</span>
              </>
            ) : (
              "–"
            )}
          </p>
          <p className="text-meta text-muted-foreground">
            {Date.parse(event.startDate) > Date.now() ? "Empieza" : "Empezó"} a las {clockTime(event.startDate)}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {signUp && can("attendee:checkin") ? (
            <Button asChild className="h-11 px-5 text-ui">
              <Link href={`${base}/puerta/escanear`}>
                <ScanLine />
                Abrir la puerta
              </Link>
            </Button>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {signUp && can("event:door-link") ? (
              <Button size="sm" variant="outline" onClick={() => onGo("puerta", "puerta-link")}>
                <QrCode />
                Compartir link de la puerta
              </Button>
            ) : null}
            {can("event:message") ? (
              <Button size="sm" variant="outline" onClick={() => setTelling(true)}>
                <Megaphone />
                Avisar algo a los que van
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>

      <AgendaPanel live base={base} input={input} start={clockTime(event.startDate)} />

      {signUp && can("attendee:checkins") ? (
        <DoorTab
          base={base}
          input={input}
          linked={data?.doorLink ?? false}
          primary={false}
          registration={event.registration}
          startDate={event.startDate}
        />
      ) : null}

      <Dialog open={telling} onOpenChange={setTelling}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Avisar algo a los que van</DialogTitle>
            <DialogDescription>Un mail a cada persona con lugar. Completá lo que está entre puntos.</DialogDescription>
          </DialogHeader>
          <Composer
            event={event}
            input={input}
            preset={roomChanged(event)}
            stats={data}
            onSent={() => setTelling(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
