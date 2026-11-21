"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";

import { cn } from "app/lib/utils";
import { EditorPanel, Notice, PanelSection } from "components/Admin/panel";
import { AvatarStack } from "components/Admin/ui/person";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";

import { formatDayLabel, plural, timeRange } from "./helpers";
import { staffKeys } from "./use-staff";

const COLUMNS = ["Tarea", "Tipo", "Día", "Inicio", "Fin", "Mín", "Lugar", "Personas", "Notas"];
const TYPE_LABEL = { task: null, ongoing: "continua", milestone: "hito" } as const;

/**
 * "Importar planilla": paste rows copied from the team's spreadsheet, see each one read back
 * (with what is wrong with it) as you paste, and create them all at once.
 */
export function ImportSheetPanel({
  open,
  onOpenChange,
  eventId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [pasted, setPasted] = useState("");

  useEffect(() => {
    if (!open) return;
    setText("");
    setPasted("");
  }, [open]);
  // Read the paste back once typing settles, not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setPasted(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);

  const preview = useQuery(
    orpc.staffTasks.import.queryOptions({
      input: pasted ? { eventId, tsv: pasted, dryRun: true } : skipToken,
      placeholderData: keepPreviousData,
      retry: false,
    })
  );
  const save = useMutation(
    orpc.staffTasks.import.mutationOptions({
      onSuccess: ({ created }) => {
        toast.success(
          plural(created, "tarea importada", "tareas importadas"),
          "Ya están en el cronograma y en los teléfonos."
        );
        onOpenChange(false);
        void queryClient.invalidateQueries({ queryKey: staffKeys(eventId).tasks });
      },
    })
  );

  const rows = pasted ? (preview.data?.rows ?? []) : [];
  const broken = rows.filter((row) => row.errors.length > 0);
  const repeated = rows.filter((row) => row.errors.length === 0 && row.duplicate);
  const fresh = rows.filter((row) => row.errors.length === 0 && !row.duplicate);
  const ready = fresh.length > 0 && broken.length === 0 && !preview.isFetching && pasted === text.trim();

  return (
    <EditorPanel
      actions={
        <>
          <Button disabled={save.isPending} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!ready || save.isPending}
            type="button"
            onClick={() => save.mutate({ eventId, tsv: pasted, dryRun: false })}
          >
            {save.isPending
              ? "Importando…"
              : fresh.length > 0
                ? `Importar ${plural(fresh.length, "tarea", "tareas")}`
                : "Importar"}
          </Button>
        </>
      }
      busy={save.isPending}
      description="Copiá las filas de la planilla, con el encabezado, y pegalas acá."
      icon={FileSpreadsheet}
      open={open}
      title="Importar planilla"
      onOpenChange={onOpenChange}
    >
      <div className="space-y-6">
        <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3 text-meta text-muted-foreground">
          <p>Columnas que entiende, en cualquier orden:</p>
          <p className="flex flex-wrap gap-1">
            {COLUMNS.map((column) => (
              <span
                key={column}
                className="rounded-sm border border-input bg-raised px-1.5 font-terminal text-2xs text-subtle"
              >
                {column}
              </span>
            ))}
          </p>
          <p>
            Tipo: tarea, continua o hito. Día: 7/11/2026 (vacío, el del evento). Personas: nombres del staff separados
            por coma. Las tareas que ya están no se repiten.
          </p>
        </div>

        <Textarea
          aria-label="Filas de la planilla"
          // 16 px on touch: a smaller field makes an iPhone zoom the page in when it's focused.
          className="min-h-40 font-terminal text-meta whitespace-pre sm:text-meta pointer-coarse:text-base pointer-coarse:sm:text-base"
          data-autofocus
          placeholder="Pegá las filas acá"
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <Notice show={preview.isError} tone="danger">
          {preview.error?.message || "No pudimos leer la planilla."}
        </Notice>
        <Notice show={save.isError} tone="danger">
          {save.error?.message || "No se pudo importar."}
        </Notice>

        {rows.length > 0 ? (
          <PanelSection
            action={
              <span className="font-terminal text-meta text-muted-foreground tabular-nums">
                {[
                  plural(fresh.length, "nueva", "nuevas"),
                  repeated.length > 0 ? `${repeated.length} ya ${repeated.length === 1 ? "está" : "están"}` : null,
                  broken.length > 0 ? `${broken.length} con errores` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            }
            title="Así queda"
          >
            <Notice show={broken.length > 0} tone="warning">
              Corregí {broken.length === 1 ? "la fila marcada" : "las filas marcadas"} en la planilla y volvé a pegar:
              se importa todo junto o nada.
            </Notice>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {rows.map((row) => (
                <li
                  key={row.line}
                  className={cn(
                    "flex gap-3 px-3 py-2.5",
                    row.errors.length > 0 && "bg-live-surface/40",
                    row.duplicate && "opacity-60"
                  )}
                >
                  <span className="w-12 shrink-0 pt-0.5 font-terminal text-2xs text-muted-foreground tabular-nums">
                    fila {row.line}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-ui font-medium text-foreground">{row.title || "Sin nombre"}</span>
                      {TYPE_LABEL[row.type] ? <Badge variant="info">{TYPE_LABEL[row.type]}</Badge> : null}
                      {row.duplicate && row.errors.length === 0 ? <Badge variant="secondary">ya está</Badge> : null}
                    </div>
                    <p className="font-terminal text-2xs text-muted-foreground tabular-nums">
                      {[row.dayDate ? formatDayLabel(row.dayDate) : null, timeRange(row) ?? "sin hora", row.location]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {row.people.length > 0 ? (
                      <p className="flex items-center gap-1.5 text-meta text-subtle">
                        <AvatarStack
                          max={4}
                          people={row.people.map((person) => ({
                            id: person.userId,
                            name: person.name,
                            image: person.image,
                          }))}
                          size={18}
                        />
                        <span className="truncate">{row.people.map((person) => person.name).join(", ")}</span>
                      </p>
                    ) : null}
                    {row.errors.map((error) => (
                      <p key={error} className="flex items-start gap-1.5 text-meta text-live-foreground">
                        <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                        {error}
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </PanelSection>
        ) : pasted && preview.isFetching ? (
          <p className="text-meta text-muted-foreground">Leyendo la planilla…</p>
        ) : null}
      </div>
    </EditorPanel>
  );
}
