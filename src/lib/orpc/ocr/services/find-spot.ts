import { generateText, Output } from "ai";
import { z } from "zod";
import type { FindFreeSpotInput, FindFreeSpotResponse } from "../schemas";
import { AI_TIMEOUT_MS, gatewayFallbacks, SLOT_PICK_MODEL } from "../models";

/**
 * How many free cells the model gets to choose from. Small on purpose: the prompt stays short
 * (faster) and every candidate is a cell we already know is free and resource-compatible, so the
 * model cannot suggest something impossible.
 */
const MAX_CANDIDATES = 12;

/** Free cells per time slot offered to the model. Two keeps room choice alive without bloat. */
const ROOMS_PER_SLOT = 2;

export interface Candidate {
  id: string;
  room: string;
  timeSlot: string;
  hasTV: boolean;
  hasWhiteboard: boolean;
}

type CandidateInput = Pick<
  FindFreeSpotInput,
  "existingNotes" | "roomsWithResources" | "availableRooms" | "availableTimeSlots"
> &
  Partial<Pick<FindFreeSpotInput, "needsTV" | "needsWhiteboard">>;

/**
 * The free cells worth offering, best first. Everything a computer can decide is decided here so
 * the model only has to judge topics: which cells are taken, which rooms have the resources the
 * talk asked for, and which rooms to spend on it.
 */
export function buildCandidates({
  needsTV = false,
  needsWhiteboard = false,
  existingNotes,
  roomsWithResources,
  availableRooms,
  availableTimeSlots,
}: CandidateInput): Candidate[] {
  const resourcesOf = (room: string) => roomsWithResources.find((r) => r.name === room);
  const occupied = new Set(existingNotes.map((note) => `${note.room}|${note.timeSlot}`));

  // A room qualifies when it has every resource the talk asked for. A room we know nothing about
  // is assumed usable — better to offer it than to leave the grid artificially full.
  const fits = (room: string) => {
    const resources = resourcesOf(room);

    if (!resources) return true;
    if (needsTV && !resources.hasTV) return false;
    if (needsWhiteboard && !resources.hasWhiteboard) return false;

    return true;
  };

  const eligibleRooms = availableRooms.filter(fits);
  const roomsToUse = eligibleRooms.length > 0 ? eligibleRooms : availableRooms;

  // Rooms whose resources this talk does not need go last: don't burn the only room with a TV on
  // a talk that never asked for one.
  const surplus = (room: string) => {
    const resources = resourcesOf(room);

    if (!resources) return 0;

    return (resources.hasTV && !needsTV ? 1 : 0) + (resources.hasWhiteboard && !needsWhiteboard ? 1 : 0);
  };

  return availableTimeSlots
    .flatMap((timeSlot) =>
      roomsToUse
        .filter((room) => !occupied.has(`${room}|${timeSlot}`))
        .sort((a, b) => surplus(a) - surplus(b))
        .slice(0, ROOMS_PER_SLOT)
        .map((room) => ({
          room,
          timeSlot,
          hasTV: resourcesOf(room)?.hasTV ?? false,
          hasWhiteboard: resourcesOf(room)?.hasWhiteboard ?? false,
        }))
    )
    .slice(0, MAX_CANDIDATES)
    .map((candidate, index) => ({ id: `c${index}`, ...candidate }));
}

const INSTRUCTIONS = `Sos quien arma la grilla de un open space de la comunidad ágil uruguaya. Elegís dónde y cuándo va una charla nueva para que la gente pueda ver lo que le interesa.

Criterios, en orden:
1. Evitar choques temáticos: si en ese horario ya hay una charla del mismo tema, elegí otro horario.
2. Continuidad por sala: si una sala ya viene con charlas del mismo tema, sumar ahí ayuda a que la gente se quede. No mezcles temas distintos en la misma sala sin motivo.
3. A igualdad de condiciones, más temprano es mejor: la grilla se llena de adelante para atrás.

Contestá en español rioplatense. La razón son dos oraciones como máximo: por qué ese lugar y qué choque estás evitando. Nada de listas ni de repetir los criterios.`;

/**
 * Suggest where to put a new talk: the free cells are computed here, the model only ranks them.
 *
 * Everything that can be arithmetic is arithmetic (which cells are free, which rooms have the
 * required resources, which rooms to offer). The model is left with the one genuinely fuzzy
 * judgement — whether two talks are about the same thing — and it picks from an enumerated list,
 * so an unavailable slot is not a possible answer.
 */
export async function findFreeSpot(input: FindFreeSpotInput): Promise<FindFreeSpotResponse> {
  const {
    title,
    speaker,
    needsTV = false,
    needsWhiteboard = false,
    additionalContext,
    existingNotes,
    roomsWithResources,
    availableRooms,
    availableTimeSlots,
  } = input;

  const candidates = buildCandidates({
    needsTV,
    needsWhiteboard,
    existingNotes,
    roomsWithResources,
    availableRooms,
    availableTimeSlots,
  });

  if (candidates.length === 0) {
    return {
      suggestedRoom: availableRooms[0] || "",
      suggestedTimeSlot: availableTimeSlots[0] || "",
      reasoning: "No hay espacios libres disponibles. Se sugiere el primer espacio disponible.",
    };
  }

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ids = candidates.map((candidate) => candidate.id) as [string, ...string[]];
  const describe = (candidate: Candidate) =>
    `${candidate.id} = ${candidate.room} @ ${candidate.timeSlot}` +
    ` (TV:${candidate.hasTV ? "sí" : "no"} pizarra:${candidate.hasWhiteboard ? "sí" : "no"})`;

  const scheduled = existingNotes
    .map((note) => `${note.timeSlot} · ${note.room}: "${note.title}"`)
    .sort()
    .join("\n");

  const prompt = `CHARLA NUEVA: "${title}"${speaker ? ` — ${speaker}` : ""}
Necesita: ${needsTV || needsWhiteboard ? [needsTV && "TV", needsWhiteboard && "pizarra"].filter(Boolean).join(" + ") : "nada en particular"}
${additionalContext ? `Pedido del staff: ${additionalContext}\n` : ""}
GRILLA ACTUAL:
${scheduled || "(vacía, es la primera charla)"}

CANDIDATOS LIBRES (elegí uno de estos ids):
${candidates.map(describe).join("\n")}`;

  try {
    const { output } = await generateText({
      model: SLOT_PICK_MODEL.primary,
      providerOptions: gatewayFallbacks(SLOT_PICK_MODEL),
      temperature: 0,
      reasoning: "low",
      timeout: { totalMs: AI_TIMEOUT_MS },
      instructions: INSTRUCTIONS,
      output: Output.object({
        name: "slot_pick",
        schema: z.object({
          candidato: z.enum(ids).describe("Id del candidato elegido"),
          razon: z.string().describe("Dos oraciones como máximo, en español"),
          alternativas: z
            .array(
              z.object({
                candidato: z.enum(ids),
                razon: z.string().describe("Una oración"),
              })
            )
            .max(2)
            .describe("Hasta dos segundas opciones, de mejor a peor"),
        }),
      }),
      prompt,
    });

    // The enum makes an unavailable cell unrepresentable, so there is no invalid-answer branch.
    const picked = byId.get(output.candidato)!;

    return {
      suggestedRoom: picked.room,
      suggestedTimeSlot: picked.timeSlot,
      reasoning: output.razon,
      alternatives: output.alternativas.flatMap((alternative) => {
        const candidate = byId.get(alternative.candidato);

        return candidate && candidate.id !== picked.id
          ? [{ room: candidate.room, timeSlot: candidate.timeSlot, reasoning: alternative.razon }]
          : [];
      }),
    };
  } catch (error) {
    console.error("❌ Error finding free spot with AI:", error);

    return {
      suggestedRoom: candidates[0].room,
      suggestedTimeSlot: candidates[0].timeSlot,
      reasoning: "Se seleccionó el primer espacio libre disponible (error en AI).",
    };
  }
}
