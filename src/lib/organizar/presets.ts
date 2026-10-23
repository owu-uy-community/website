import type { RsvpQuestion, VolunteerRole } from "../db/schema";

/**
 * The sign-up questions Organizá knows how to read: diet (counted for the food), accessibility,
 * photos (a chip at the door) and the ID some buildings ask for (sensitive: only community admins
 * see it, and the daily retention sweep deletes it a week after the event). Client-safe.
 */
export type QuestionPreset = NonNullable<RsvpQuestion["preset"]>;

export const PRESETS: Record<QuestionPreset, { button: string; label: string; options?: string[] }> = {
  dieta: {
    button: "Comida",
    label: "¿Comés algo en especial?",
    options: ["Como de todo", "Vegetariana", "Vegana", "Sin TACC", "Vegetariana y sin TACC"],
  },
  accesibilidad: {
    button: "Accesibilidad",
    label: "¿Necesitás algo para participar? (accesibilidad, movilidad, lo que sea)",
  },
  foto: { button: "Fotos", label: "¿Te podemos sacar fotos?", options: ["Sí", "Preguntame antes", "No"] },
  ci: {
    button: "Cédula para entrar",
    // The host-day sheet hands it to the space's security (slice D reads preset "ci"): the label says so
    label: "Cédula para el ingreso (se la pasamos solo a la seguridad del espacio; la borramos a la semana)",
  },
};

/** A preset as a question: its own id, never required (the ID one is, since the building asks for it). */
export const presetQuestion = (preset: QuestionPreset): RsvpQuestion => ({
  id: preset,
  label: PRESETS[preset].label,
  required: preset === "ci",
  preset,
  ...(PRESETS[preset].options ? { options: PRESETS[preset].options } : {}),
});

/** The questions whose answers only community admins see (and nobody, a week after the event). */
export const sensitiveIds = (questions: RsvpQuestion[]) =>
  questions.filter((question) => question.preset === "ci").map((question) => question.id);

const answerTo = (questions: RsvpQuestion[], answers: Record<string, string>, preset: QuestionPreset) => {
  const question = questions.find((item) => item.preset === preset);

  return question ? (answers[question.id] ?? "").trim() : "";
};

/** Of everyone's answers to the diet question: who eats veggie, who needs gluten-free. */
export function dietTally(questions: RsvpQuestion[], everyone: Record<string, string>[]) {
  let vegetarian = 0;
  let glutenFree = 0;
  let answered = 0;
  for (const answers of everyone) {
    const diet = answerTo(questions, answers, "dieta").toLowerCase();
    if (!diet) continue;
    answered += 1;
    if (/vegetarian|vegan/.test(diet)) vegetarian += 1;
    if (/sin tacc|celiac|gluten/.test(diet)) glutenFree += 1;
  }

  return { vegetarian, glutenFree, answered };
}

/** The door's photo chip: only when the person asked for care ("Fotos: no"). */
export function photoPreference(questions: RsvpQuestion[], answers: Record<string, string>) {
  const answer = answerTo(questions, answers, "foto");
  if (!answer || answer === "Sí") return null;

  return answer === "No" ? "Sin fotos" : "Fotos: preguntar antes";
}

/** The hands an event can ask for, in the order the RSVP card offers them. */
export const VOLUNTEER_ROLES: { value: VolunteerRole; label: string }[] = [
  { value: "recepcion", label: "Recepción (30 min)" },
  { value: "puerta", label: "Puerta" },
  { value: "comida", label: "Comida" },
  { value: "fotos", label: "Fotos" },
  { value: "mc", label: "Presentar (MC)" },
  { value: "cierre", label: "Cierre" },
];

export const volunteerLabel = (role: VolunteerRole) =>
  VOLUNTEER_ROLES.find((item) => item.value === role)?.label.replace(/ \(.*\)$/, "") ?? role;
