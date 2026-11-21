import * as z from "zod";

/**
 * What a space is like to get to and be in: specific facts beat "accesible". Staff, the host
 * (its form and the yearly check) edit them; organizers see them all; an event page shows the
 * attendee-facing ones (see publicFacts). Client-safe.
 */
export const VenueFactsSchema = z.object({
  stepFree: z.boolean().optional(),
  elevator: z.boolean().optional(),
  accessibleRestroom: z.boolean().optional(),
  genderNeutralRestroom: z.boolean().optional(),
  parking: z.string().trim().max(200).optional(),
  transit: z.string().trim().max(200).optional(),
  idRequired: z.boolean().optional(),
  idDeadlineHours: z.number().int().min(1).max(168).optional(),
  foodRules: z.string().trim().max(300).optional(),
  avNotes: z.string().trim().max(300).optional(),
});
export type VenueFactsInput = z.infer<typeof VenueFactsSchema>;

/** The yes/no ones, as a host or an attendee reads them */
export const FACT_FLAGS = [
  { key: "stepFree", label: "Entrada sin escalones" },
  { key: "elevator", label: "Ascensor" },
  { key: "accessibleRestroom", label: "Baño accesible" },
  { key: "genderNeutralRestroom", label: "Baño sin género" },
] as const;

/** The building asks for the attendees' names and IDs this long before, unless the space says */
export const DEFAULT_ID_DEADLINE_HOURS = 24;

/** What an event page may show: never the AV notes (they're for organizers); where to park or which bus
 * only when the space shows its address to everyone, since they point at it. */
export function publicFacts(facts: VenueFactsInput, addressVisibility: "public" | "attendees") {
  const open = addressVisibility === "public";
  const shown = {
    stepFree: facts.stepFree,
    elevator: facts.elevator,
    accessibleRestroom: facts.accessibleRestroom,
    genderNeutralRestroom: facts.genderNeutralRestroom,
    parking: open ? facts.parking || undefined : undefined,
    transit: open ? facts.transit || undefined : undefined,
    idRequired: facts.idRequired,
    foodRules: facts.foodRules || undefined,
  };

  return Object.values(shown).some((value) => value !== undefined && value !== false) ? shown : null;
}
export type PublicVenueFacts = NonNullable<ReturnType<typeof publicFacts>>;

/** Short lines for the organizer's venue card and the wizard ("Ascensor", "AV: HDMI-C"). */
export function factLines(facts: VenueFactsInput) {
  return [
    ...FACT_FLAGS.filter((flag) => facts[flag.key]).map((flag) => flag.label),
    facts.idRequired ? `Piden lista con cédula ${facts.idDeadlineHours ?? DEFAULT_ID_DEADLINE_HOURS} h antes` : "",
    facts.avNotes ? `AV: ${facts.avNotes}` : "",
    facts.foodRules ? `Comida: ${facts.foodRules}` : "",
  ].filter(Boolean);
}
