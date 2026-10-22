"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Presentation, Trash2 } from "lucide-react";
import * as z from "zod";

import { SurveyTab } from "components/Admin/comms/SurveyTab";
import { FieldError } from "components/Admin/panel";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { toast } from "components/shared/ui/toast-utils";
import { MaterialSchema, type EditableEvent, type Material } from "lib/orpc/events/schemas";
import { orpc } from "lib/orpc/client";

import { StaleNotice, useEventSave, type EventInput } from "./save";

const KINDS: { value: Material["kind"]; title: string }[] = [
  { value: "grabacion", title: "Grabación" },
  { value: "slides", title: "Slides" },
  { value: "link", title: "Link" },
];
const MAX = 10;
const Materials = z.array(MaterialSchema).max(MAX);

/** Recordings, slides and links: the public page shows them once the event is over. */
function MaterialsEditor({ input, event }: { input: EventInput; event: EditableEvent }) {
  const { save, saving, stale, reload } = useEventSave(input);
  const [edits, setEdits] = useState<Material[] | null>(null);
  const list = edits ?? event.materials;
  const checked = Materials.safeParse(list);
  const error = checked.success ? undefined : checked.error.issues[0]?.message;
  const change = (index: number, patch: Partial<Material>) =>
    setEdits(list.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  return (
    <Panel>
      <PanelHead
        icon={Presentation}
        meta={`${list.length}/${MAX}`}
        title="Materiales"
        actions={
          <Button
            disabled={list.length >= MAX}
            size="sm"
            variant="ghost"
            onClick={() => setEdits([...list, { kind: "grabacion", title: "", url: "" }])}
          >
            <Plus />
            Agregar
          </Button>
        }
      />
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(submit) => {
          submit.preventDefault();
          if (!checked.success) return;
          void save({ materials: checked.data }).then((ok) => {
            if (!ok) return;
            setEdits(null);
            toast.success("Materiales guardados", "Se ven en la página cuando el evento termina.");
          });
        }}
      >
        <StaleNotice
          show={stale}
          onReload={() => {
            setEdits(null);
            void reload();
          }}
        />
        {list.length === 0 ? (
          <p className="text-ui text-muted-foreground">
            La grabación, las slides o un link útil: aparecen en la página del evento cuando termina.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((item, index) => (
              <li key={index} className="grid gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                <Select value={item.kind} onValueChange={(kind) => change(index, { kind: kind as Material["kind"] })}>
                  <SelectTrigger aria-label={`Tipo del material ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((kind) => (
                      <SelectItem key={kind.value} value={kind.value}>
                        {kind.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={`Título del material ${index + 1}`}
                  maxLength={120}
                  placeholder="La charla de apertura"
                  value={item.title}
                  onChange={(event) => change(index, { title: event.target.value })}
                />
                <Input
                  aria-label={`Link del material ${index + 1}`}
                  inputMode="url"
                  placeholder="https://youtu.be/…"
                  value={item.url}
                  onChange={(event) => change(index, { url: event.target.value.trim() })}
                />
                <Button
                  aria-label={`Sacar el material ${index + 1}`}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => setEdits(list.filter((_, at) => at !== index))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {edits ? <FieldError message={error} /> : null}
        <Button
          className="self-end"
          disabled={!edits || !checked.success || saving}
          size="sm"
          type="submit"
          variant="outline"
        >
          {saving ? "Guardando…" : "Guardar materiales"}
        </Button>
      </form>
    </Panel>
  );
}

/** After the event: what people said (the survey) and what stays (recordings, slides). */
export function FeedbackTab({ input, event }: { input: EventInput; event: EditableEvent }) {
  const survey = useQuery(orpc.surveys.get.queryOptions({ input: { eventId: event.id }, staleTime: 30_000 }));

  return (
    <div className="flex flex-col gap-4">
      <MaterialsEditor event={event} input={input} />
      <SurveyTab
        communitySlug={event.communitySlug}
        eventId={event.id}
        eventSlug={event.slug}
        survey={survey}
        surveyUrl={
          typeof window === "undefined"
            ? undefined
            : `${window.location.origin}/comunidad/${event.communitySlug}/events/${event.slug}/encuesta`
        }
      />
    </div>
  );
}
