"use client";

import { useState } from "react";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpRight, ClipboardList, Plus, Printer, Trash2 } from "lucide-react";

import { cn } from "app/lib/utils";
import { Notice } from "components/Admin/panel";
import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  QuestionKindSchema,
  type QuestionKind,
  type Survey,
} from "lib/orpc/surveys/schemas";

import { SurveyResults } from "./SurveyResults";

export const KIND_LABELS: Record<QuestionKind, string> = {
  nps: "NPS (0 a 10)",
  rating: "Puntaje (1 a 5)",
  choice: "Opciones",
  text: "Texto libre",
};

/** A question as the form edits it: choice options as one line each, parsed on save. */
type DraftQuestion = { id: string; kind: QuestionKind; label: string; options: string };
type Draft = { title: string; questions: DraftQuestion[] };

const toDraft = (survey: Survey): Draft => ({
  title: survey.title,
  questions: survey.questions.map((question) => ({
    id: question.id,
    kind: question.kind,
    label: question.label,
    options: (question.options ?? []).join("\n"),
  })),
});
const optionsOf = (question: DraftQuestion) =>
  question.options
    .split("\n")
    .map((option) => option.trim())
    .filter(Boolean);
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/** What stops a save, in the order you'd fix it. */
function problemOf(draft: Draft): string | null {
  if (!draft.title.trim()) return "Poné un título.";
  if (draft.questions.length === 0) return "Agregá al menos una pregunta.";
  const index = draft.questions.findIndex((question) => !question.label.trim());
  if (index >= 0) return `La pregunta ${index + 1} no tiene texto.`;
  const choice = draft.questions.findIndex(
    (question) =>
      question.kind === "choice" && (optionsOf(question).length < 2 || optionsOf(question).length > MAX_OPTIONS)
  );
  if (choice >= 0) return `La pregunta ${choice + 1} necesita entre 2 y ${MAX_OPTIONS} opciones.`;
  return null;
}

function SurveyEditor({ survey, eventId }: { survey: Survey; eventId: string }) {
  const queryClient = useQueryClient();
  const server = toDraft(survey);
  const [baseline, setBaseline] = useState(server);
  const [draft, setDraft] = useState(server);
  const dirty = !same(draft, baseline);
  // A change saved elsewhere replaces what's shown, unless you're in the middle of an edit.
  if (!dirty && !same(server, baseline)) {
    setBaseline(server);
    setDraft(server);
  }
  const saved = new Set(baseline.questions.map((question) => question.id));
  const problem = problemOf(draft);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.surveys.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.comms.cadence.key({ input: { eventId } }) });
  };
  const save = useMutation(
    orpc.surveys.upsert.mutationOptions({
      onSuccess: (next) => {
        setBaseline(toDraft(next));
        setDraft(toDraft(next));
        toast.success("Encuesta guardada");
        refresh();
      },
      onError: (error) => toast.error("No se pudo guardar", error.message),
    })
  );
  const toggle = useMutation(
    orpc.surveys.upsert.mutationOptions({
      onSuccess: (next) => {
        toast.success(
          next.isOpen ? "Encuesta abierta" : "Encuesta cerrada",
          next.isOpen ? "Ya se puede responder desde el link y los QR." : "El link muestra que está cerrada."
        );
        refresh();
      },
      onError: (error) => toast.error("No se pudo cambiar", error.message),
    })
  );

  const setQuestion = (id: string, patch: Partial<DraftQuestion>) =>
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) => (question.id === id ? { ...question, ...patch } : question)),
    }));
  const move = (index: number, by: number) =>
    setDraft((current) => {
      const questions = [...current.questions];
      const [question] = questions.splice(index, 1);
      questions.splice(index + by, 0, question);
      return { ...current, questions };
    });
  const add = () =>
    setDraft((current) => ({
      ...current,
      questions: [
        ...current.questions,
        { id: `q-${crypto.randomUUID().slice(0, 8)}`, kind: "rating", label: "", options: "" },
      ],
    }));

  return (
    <Panel>
      <PanelHead
        actions={
          <label className="flex min-h-11 items-center gap-2 text-meta text-muted-foreground" htmlFor="survey-open">
            {survey.isOpen ? "Abierta" : "Cerrada"}
            <Switch
              checked={survey.isOpen}
              disabled={toggle.isPending}
              id="survey-open"
              onCheckedChange={(isOpen) => toggle.mutate({ eventId, isOpen })}
            />
          </label>
        }
        icon={ClipboardList}
        meta={`${draft.questions.length} de ${MAX_QUESTIONS} preguntas`}
        title="Encuesta post-evento"
      />
      <div className="space-y-4 p-3.5">
        <div>
          <label className="mb-1.5 block text-meta text-muted-foreground" htmlFor="survey-title">
            Título
          </label>
          <Input
            id="survey-title"
            maxLength={120}
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
        </div>
        {survey.responses > 0 ? (
          <Notice tone="info">
            Ya hay {survey.responses} {survey.responses === 1 ? "respuesta" : "respuestas"}: el tipo de las preguntas
            que ya estaban queda fijo. Para preguntar otra cosa, agregá una nueva.
          </Notice>
        ) : null}
        <ol className="space-y-2.5">
          {draft.questions.map((question, index) => (
            <li key={question.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <span className="font-terminal text-meta text-muted-foreground tabular-nums">{index + 1}</span>
                <Select
                  disabled={survey.responses > 0 && saved.has(question.id)}
                  value={question.kind}
                  onValueChange={(value) =>
                    setQuestion(question.id, {
                      kind: QuestionKindSchema.options.find((kind) => kind === value) ?? "text",
                    })
                  }
                >
                  <SelectTrigger aria-label={`Tipo de la pregunta ${index + 1}`} className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QuestionKindSchema.options.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="ml-auto flex gap-0.5">
                  <Button
                    aria-label="Subir"
                    disabled={index === 0}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    aria-label="Bajar"
                    disabled={index === draft.questions.length - 1}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    aria-label="Quitar pregunta"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        questions: current.questions.filter((item) => item.id !== question.id),
                      }))
                    }
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
              <label className="sr-only" htmlFor={`question-${question.id}`}>
                Pregunta {index + 1}
              </label>
              <Input
                className="mt-2"
                id={`question-${question.id}`}
                maxLength={200}
                placeholder="¿Qué querés preguntar?"
                value={question.label}
                onChange={(event) => setQuestion(question.id, { label: event.target.value })}
              />
              {question.kind === "choice" ? (
                <div className="mt-2">
                  <label className="mb-1 block text-2xs text-muted-foreground" htmlFor={`options-${question.id}`}>
                    Opciones, una por línea (de 2 a {MAX_OPTIONS})
                  </label>
                  <Textarea
                    className="min-h-20"
                    id={`options-${question.id}`}
                    value={question.options}
                    onChange={(event) => setQuestion(question.id, { options: event.target.value })}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <Button
          className="w-full"
          disabled={draft.questions.length >= MAX_QUESTIONS}
          size="sm"
          variant="outline"
          onClick={add}
        >
          <Plus />
          Agregar pregunta
        </Button>
        {dirty && problem ? <p className="text-meta text-warning-foreground">{problem}</p> : null}
        <div className={cn("flex items-center gap-2", !dirty && "hidden")}>
          <span className="text-meta text-muted-foreground">Cambios sin guardar</span>
          <Button
            className="ml-auto"
            disabled={save.isPending}
            size="sm"
            variant="ghost"
            onClick={() => setDraft(baseline)}
          >
            Descartar
          </Button>
          <Button
            disabled={problem !== null || save.isPending}
            size="sm"
            onClick={() =>
              save.mutate({
                eventId,
                title: draft.title.trim(),
                questions: draft.questions.map((question) => ({
                  id: question.id,
                  kind: question.kind,
                  label: question.label.trim(),
                  ...(question.kind === "choice" ? { options: optionsOf(question) } : {}),
                })),
              })
            }
          >
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** The post-event survey: write it, open it, print the rooms' QR and read the answers. */
export function SurveyTab({
  eventId,
  eventSlug,
  communitySlug,
  survey,
  surveyUrl,
}: {
  eventId: string;
  eventSlug: string;
  communitySlug: string;
  survey: UseQueryResult<Survey | null>;
  /** The public link, absolute (from the cadence). */
  surveyUrl: string | undefined;
}) {
  const queryClient = useQueryClient();
  const create = useMutation(
    orpc.surveys.upsert.mutationOptions({
      onSuccess: () => {
        toast.success("Encuesta creada", "Revisá las preguntas y abrila cuando quieras.");
        void queryClient.invalidateQueries({ queryKey: orpc.surveys.key() });
      },
      onError: (error) => toast.error("No se pudo crear", error.message),
    })
  );
  const publicPath = `/comunidad/${communitySlug}/events/${eventSlug}/encuesta`;

  if (survey.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (survey.isError) return <ErrorState onRetry={() => void survey.refetch()} retrying={survey.isFetching} />;
  if (!survey.data) {
    return (
      <EmptyState
        action={
          <Button disabled={create.isPending} onClick={() => create.mutate({ eventId })}>
            <Plus />
            {create.isPending ? "Creando…" : "Crear encuesta"}
          </Button>
        }
        description="Arranca con seis preguntas pensadas para una conferencia: NPS, qué se llevan, el open space, las charlas, si volverían y comentarios. Después la ajustás."
        icon={ClipboardList}
        title="Todavía no hay encuesta"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={survey.data.isOpen ? "success" : "secondary"}>
          {survey.data.isOpen ? "abierta" : "cerrada"}
        </Badge>
        <MicroLabel className="max-sm:hidden">Link público</MicroLabel>
        <a
          className="min-w-0 truncate font-terminal text-meta text-subtle hover:text-foreground pointer-coarse:py-3.5"
          href={publicPath}
          rel="noopener noreferrer"
          target="_blank"
        >
          {(surveyUrl ?? publicPath).replace(/^https?:\/\//, "")}
        </a>
        <span className="ml-auto flex gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={publicPath} rel="noopener noreferrer" target="_blank">
              <ArrowUpRight />
              Ver encuesta
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a
              href={`/admin/${communitySlug}/comunicacion/qr?event=${encodeURIComponent(eventSlug)}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Printer />
              Imprimir QR
            </a>
          </Button>
        </span>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <SurveyEditor eventId={eventId} survey={survey.data} />
        <SurveyResults eventId={eventId} surveyUrl={surveyUrl} />
      </div>
    </div>
  );
}
