"use client";

import { Fragment } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, EyeOff, MessageCircleQuestion, Pin, type LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { useInputsWithStatus } from "components/OwyStage/inputs";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import { rankQuestions } from "lib/owy-stage/questions";
import type { Moderation } from "lib/owy-stage/scenes";

/** How many the wall lists (the live questions scene). */
const ON_WALL = 6;

type Action = { moderation: Exclude<Moderation, "">; on: string; off: string; icon: LucideIcon };

/** Pressing the active one again puts the question back as it was. */
const ACTIONS: Action[] = [
  { moderation: "pinned", on: "Fijar arriba", off: "Dejar de fijar", icon: Pin },
  { moderation: "answered", on: "Marcar respondida", off: "Desmarcar respondida", icon: Check },
  { moderation: "hidden", on: "Ocultar de la pared", off: "Volver a mostrar", icon: EyeOff },
];

/**
 * The questions of the round on air, ranked like the wall shows them, with what the moderator
 * can do to each: pin it on top, mark it answered (it dims), or hide it (from the phones too).
 */
export function QuestionsPanel({ round }: { round: string }) {
  const { inputs, loaded, failed, retry } = useInputsWithStatus(round);
  const questions = rankQuestions(inputs);
  const hidden = questions.filter((question) => question.moderation === "hidden").length;
  const moderate = useMutation(
    orpc.owyStage.moderate.mutationOptions({
      onError: (error) => toast.error("No se pudo moderar la pregunta", error.message),
    })
  );

  return (
    <section aria-label="Preguntas" className="flex min-h-0 flex-1 flex-col border-t border-border">
      <div className="flex h-10 shrink-0 items-center gap-2 px-4">
        <MicroLabel>Preguntas</MicroLabel>
        {questions.length > 0 && (
          <span className="ml-auto font-terminal text-meta text-muted-foreground tabular-nums">
            {Math.min(questions.length - hidden, ON_WALL)} en la pared
            {hidden > 0 ? ` · ${hidden} ${hidden === 1 ? "oculta" : "ocultas"}` : ""}
          </span>
        )}
      </div>
      {failed ? (
        <ErrorState className="mx-4" compact title="No se pudieron leer las preguntas" onRetry={retry} />
      ) : !loaded ? (
        <div className="space-y-2 px-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : questions.length === 0 ? (
        <EmptyState
          compact
          description="Llegan desde los celulares. Acá las fijás arriba, las marcás respondidas o las ocultás."
          icon={MessageCircleQuestion}
          title="Todavía no hay preguntas"
        />
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {questions.map((question, index) => {
            const busy = moderate.isPending && moderate.variables.inputId === question.id;
            // Hidden ones rank last, so the first six are exactly what the wall lists.
            const offWall = index === ON_WALL && question.moderation !== "hidden";

            return (
              <Fragment key={question.id}>
                {offWall && (
                  <li aria-hidden className="border-t border-border px-4 pt-3 pb-1">
                    <MicroLabel>No entran en la pared</MicroLabel>
                  </li>
                )}
                <li
                  className={cn(
                    "flex items-start gap-2.5 border-t border-border px-4 py-2",
                    question.moderation === "pinned" && "bg-raised",
                    question.moderation === "answered" && "text-muted-foreground",
                    question.moderation === "hidden" && "opacity-50"
                  )}
                >
                  <span
                    className="mt-0.5 w-9 shrink-0 font-terminal text-meta text-muted-foreground tabular-nums"
                    title={`${question.votes} votos`}
                  >
                    {question.moderation === "answered" ? "✓" : "▲"} {question.votes}
                  </span>
                  <p
                    className={cn(
                      "line-clamp-3 min-w-0 flex-1 text-ui text-pretty",
                      question.moderation === "hidden" && "line-through"
                    )}
                  >
                    {question.value}
                  </p>
                  <span className="flex shrink-0 gap-1">
                    {ACTIONS.map(({ moderation, on, off, icon: Icon }) => {
                      const active = question.moderation === moderation;

                      return (
                        <Button
                          key={moderation}
                          aria-label={active ? off : on}
                          aria-pressed={active}
                          className={cn(
                            "pointer-coarse:size-10",
                            active && "bg-raised text-foreground ring-1 ring-input"
                          )}
                          disabled={busy}
                          size="icon-sm"
                          title={active ? off : on}
                          variant="ghost"
                          onClick={() =>
                            moderate.mutate({ inputId: question.id, moderation: active ? "" : moderation })
                          }
                        >
                          <Icon />
                        </Button>
                      );
                    })}
                  </span>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </section>
  );
}
