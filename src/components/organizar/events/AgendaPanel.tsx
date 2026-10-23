"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CalendarClock, Mic, Plus, Presentation, Trash2 } from "lucide-react";

import { cn } from "app/lib/utils";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { moveItem, withStarts } from "lib/organizar/agenda";
import { orpc } from "lib/orpc/client";
import type { RunOfShow } from "lib/orpc/run-of-show/schemas";
import { rundownStatus } from "lib/orpc/run-of-show/timing";

import { usePanel } from "../shell/context";
import type { EventInput } from "./save";

type Item = { id?: string; title: string; durationMin: number };

/**
 * The night's agenda: made from the talks, then edited as a list (titles, minutes, Subir/Bajar).
 * Starts follow one after the other from the event's start. On the day, the moment on now is
 * marked; MC mode and the welcome slides are one tap away.
 */
export function AgendaPanel({
  input,
  base,
  start,
  live = false,
}: {
  input: EventInput;
  /** The event's path in the panel */
  base: string;
  /** "19:00": the event's start, where the first moment begins */
  start: string;
  /** The day itself: mark what's on now */
  live?: boolean;
}) {
  const queryClient = useQueryClient();
  const { can } = usePanel();
  const agenda = useQuery(orpc.events.agenda.queryOptions({ input, refetchInterval: live ? 30_000 : false }));
  const [edits, setEdits] = useState<Item[] | null>(null);
  const set = (result: RunOfShow) => queryClient.setQueryData(orpc.events.agenda.queryKey({ input }), result);
  const generate = useMutation(
    orpc.events.generateAgenda.mutationOptions({
      onSuccess: (result) => {
        set(result);
        setEdits(null);
      },
      onError: (error) => toast.error("No se pudo armar la agenda", error.message),
    })
  );
  const save = useMutation(
    orpc.events.saveAgenda.mutationOptions({
      onSuccess: (result) => {
        set(result);
        setEdits(null);
        toast.success("Agenda guardada", "El modo MC y la presentación ya la muestran.");
      },
      onError: (error) => toast.error("No se pudo guardar la agenda", error.message),
    })
  );
  const editable = can("event:update");
  const moments = agenda.data?.moments ?? [];
  const items: Item[] = edits ?? moments.map(({ id, title, durationMin }) => ({ id, title, durationMin }));
  const planned = withStarts(items, start);
  const { status } = rundownStatus(moments);
  const change = (index: number, patch: Partial<Item>) =>
    setEdits(items.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  const invalid = items.some(
    (item) => !item.title.trim() || !Number.isInteger(item.durationMin) || item.durationMin < 0
  );

  return (
    <Panel>
      <PanelHead
        actions={
          moments.length > 0 ? (
            <div className="flex gap-1.5">
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/mc`}>
                  <Mic />
                  Modo MC
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/presentacion`}>
                  <Presentation />
                  Presentación
                </Link>
              </Button>
            </div>
          ) : undefined
        }
        icon={CalendarClock}
        title="Agenda"
      />
      {agenda.isError ? (
        <ErrorState className="m-3" compact title="No pudimos traer la agenda" onRetry={() => void agenda.refetch()} />
      ) : !agenda.data ? (
        <Skeleton className="m-4 h-24" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 p-4">
          <p className="text-meta text-muted-foreground">
            Puertas y networking, la bienvenida, cada charla según su largo, los relámpagos y el cierre. Después la
            editás.
          </p>
          {editable ? (
            <Button disabled={generate.isPending} size="sm" variant="outline" onClick={() => generate.mutate(input)}>
              Armar la agenda con las charlas
            </Button>
          ) : null}
        </div>
      ) : (
        <form
          className="flex flex-col"
          onSubmit={(submit) => {
            submit.preventDefault();
            if (!invalid) save.mutate({ ...input, items });
          }}
        >
          <ol className="divide-y divide-border">
            {planned.map((item, index) => {
              const moment = item.id ? moments.find((candidate) => candidate.id === item.id) : undefined;
              const state = moment ? status[moments.indexOf(moment)] : "pending";

              return (
                <li
                  key={item.id ?? `new-${index}`}
                  aria-current={live && state === "live" ? "step" : undefined}
                  className={cn(
                    "flex flex-wrap items-center gap-2 px-4 py-2",
                    live && state === "live" && "bg-primary-surface"
                  )}
                >
                  <span className="w-11 shrink-0 font-terminal text-meta text-muted-foreground tabular-nums">
                    {item.plannedStart}
                  </span>
                  {editable ? (
                    <>
                      <Input
                        aria-label={`Momento ${index + 1}`}
                        className="h-8 min-w-40 flex-1"
                        maxLength={200}
                        value={item.title}
                        onChange={(event) => change(index, { title: event.target.value })}
                      />
                      <label className="flex items-center gap-1 text-meta text-muted-foreground">
                        <Input
                          aria-label={`Minutos de «${item.title || `momento ${index + 1}`}»`}
                          className="h-8 w-16 font-terminal tabular-nums"
                          inputMode="numeric"
                          max={240}
                          min={0}
                          type="number"
                          value={item.durationMin}
                          onChange={(event) => change(index, { durationMin: Number(event.target.value) })}
                        />
                        min
                      </label>
                      <div className="flex">
                        <Button
                          aria-label={`Subir «${item.title}»`}
                          disabled={index === 0}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                          onClick={() => setEdits(moveItem(items, index, -1))}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          aria-label={`Bajar «${item.title}»`}
                          disabled={index === items.length - 1}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                          onClick={() => setEdits(moveItem(items, index, 1))}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          aria-label={`Quitar «${item.title}»`}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                          onClick={() => setEdits(items.filter((_, at) => at !== index))}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <span className="min-w-0 flex-1 text-ui text-foreground">
                      {item.title} <span className="text-muted-foreground">· {item.durationMin} min</span>
                    </span>
                  )}
                  {live && state === "live" ? <Badge variant="warning">Ahora</Badge> : null}
                  {live && state === "done" ? <Badge variant="secondary">Pasó</Badge> : null}
                </li>
              );
            })}
          </ol>
          {editable ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setEdits([...items, { title: "", durationMin: 10 }])}
              >
                <Plus />
                Agregar momento
              </Button>
              {edits ? (
                <div className="flex gap-1.5">
                  <Button size="sm" type="button" variant="ghost" onClick={() => setEdits(null)}>
                    Descartar
                  </Button>
                  <Button disabled={invalid || save.isPending} size="sm" type="submit" variant="outline">
                    {save.isPending ? "Guardando…" : "Guardar la agenda"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      )}
    </Panel>
  );
}
