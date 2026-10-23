"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, ShieldAlert } from "lucide-react";

import { cn } from "app/lib/utils";
import { SettingsRow } from "components/Admin/settings/settings";
import { Button } from "components/shared/ui/button";
import { PRESETS, presetQuestion, VOLUNTEER_ROLES, type QuestionPreset } from "lib/organizar/presets";
import { DEFAULT_SHOW_RATE } from "lib/organizar/rules";
import { suggestedLimit } from "lib/organizar/turnout";
import { orpc } from "lib/orpc/client";
import type { EditableEvent } from "lib/orpc/events/schemas";

import type { DraftChange } from "./WizardSteps";

/** The room size the capacity hint uses as its example */
const ROOM = 40;

/**
 * How many to accept for a room: capacity ÷ the community's show rate (or 55% until it has door
 * data for 3 events), in a sentence with where the rate comes from.
 */
export function useCapacityHint(communityId: string) {
  const showUp = useQuery({ ...orpc.events.showUp.queryOptions({ input: { communityId } }), staleTime: 10 * 60_000 });
  const rate = showUp.data?.rate ?? null;
  const percent = Math.round((rate ?? DEFAULT_SHOW_RATE) * 100);
  const why =
    rate === null
      ? `a un meetup gratis suele venir el ${percent} % de quienes se anotan`
      : `a tus últimos eventos vino el ${percent} % de los anotados`;

  return `Si tu sala es para ${ROOM}, podés aceptar hasta ~${suggestedLimit(ROOM, rate)}: ${why}.`;
}

const ORDER: QuestionPreset[] = ["dieta", "accesibilidad", "foto", "ci"];

/**
 * The questions Organizá knows how to read, one tap each: diet (counted for the food), access needs,
 * photos (a chip at the door) and, only when the space asks for it, the ID for the building's
 * security (sensitive: only admins see it and it's deleted a week after). "Primera vez" isn't
 * asked: the history says it.
 */
export function QuestionPresets({ draft, set }: { draft: EditableEvent; set: (change: DraftChange) => void }) {
  const has = (preset: QuestionPreset) => draft.questions.some((question) => question.preset === preset);
  const offered = ORDER.filter((preset) => preset !== "ci" || draft.venue?.idRequired);
  const left = offered.filter((preset) => !has(preset));
  if (left.length === 0 || draft.questions.length >= 5) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-meta text-muted-foreground">Preguntas listas:</span>
      {left.map((preset) => (
        <Button
          key={preset}
          size="xs"
          variant="ghost"
          onClick={() => set({ questions: [...draft.questions, presetQuestion(preset)] })}
        >
          {preset === "ci" ? <ShieldAlert /> : <Plus />}
          {PRESETS[preset].button}
        </Button>
      ))}
    </div>
  );
}

/** "Pedir una mano": the small jobs the RSVP card offers to attendees (all optional for them). */
export function VolunteerRoles({ draft, set }: { draft: EditableEvent; set: (change: DraftChange) => void }) {
  return (
    <SettingsRow
      hint="La tarjeta de inscripción pregunta «¿Querés dar una mano?»; en Inscriptos ves quién se ofreció."
      label="Pedir una mano"
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pedir una mano">
        {VOLUNTEER_ROLES.map((role) => {
          const on = draft.volunteerRoles.includes(role.value);

          return (
            <button
              key={role.value}
              aria-pressed={on}
              className={cn(
                "flex min-h-7 items-center rounded-md border px-2.5 py-1 text-meta transition-colors",
                on ? "border-primary/60 bg-primary-surface text-foreground" : "border-input text-muted-foreground"
              )}
              type="button"
              onClick={() =>
                set({
                  volunteerRoles: on
                    ? draft.volunteerRoles.filter((item) => item !== role.value)
                    : [...draft.volunteerRoles, role.value],
                })
              }
            >
              {role.label}
            </button>
          );
        })}
      </div>
    </SettingsRow>
  );
}
