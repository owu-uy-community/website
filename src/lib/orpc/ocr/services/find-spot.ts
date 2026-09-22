import { generateText, Output } from "ai";
import { z } from "zod";
import type { FindFreeSpotInput, FindFreeSpotResponse } from "../schemas";
import { AI_TIMEOUT_MS, describeAiFailure, gatewayFallbacks, SLOT_PICK_MODEL } from "../models";

/**
 * How many free cells the model gets to choose from. Small on purpose: the prompt stays short
 * (faster) and every candidate is a cell we already know is free and resource-compatible, so the
 * model cannot suggest something impossible.
 */
const MAX_CANDIDATES = 12;

/**
 * Free rooms offered per time slot: the thriftiest one, and the one that is already becoming a
 * track. Two, so room choice stays alive without bloating the prompt — and picked for *different*
 * reasons, so the continuity criterion has something to continue.
 */
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
  Partial<Pick<FindFreeSpotInput, "speaker" | "needsTV" | "needsWhiteboard">>;

/** Handwritten names arrive with inconsistent case and accents; compare them leniently. */
function sameName(a: string | undefined, b: string | undefined): boolean {
  const normalise = (value: string | undefined) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const left = normalise(a);

  return left.length > 0 && left === normalise(b);
}

/**
 * The free cells worth offering, best first. Everything a computer can decide is decided here so
 * the model only has to judge topics: which cells are taken, which rooms have the resources the
 * talk asked for, whether the speaker is already busy, and how loaded each block is.
 *
 * Order matters and is part of the design. Candidates come out least-loaded block first, one room
 * per block before any block gets a second — models measurably favour the earlier options in a
 * labelled list, so the list is ordered to make that bias agree with the balancing rule instead of
 * fighting it.
 */
export function buildCandidates({
  speaker,
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

  const talksIn = (room: string) => existingNotes.filter((note) => note.room === room).length;
  const load = (timeSlot: string) => existingNotes.filter((note) => note.timeSlot === timeSlot).length;

  // Nobody can be in two rooms at once. This is arithmetic, so it is a hard constraint here rather
  // than a line in the prompt the model may or may not honour.
  const busyFor = new Set(
    existingNotes.filter((note) => sameName(speaker, note.speaker)).map((note) => note.timeSlot)
  );

  const collect = (avoidSpeakerClash: boolean) => {
    const slots = availableTimeSlots
      .map((timeSlot, index) => ({ timeSlot, index }))
      .filter(({ timeSlot }) => !(avoidSpeakerClash && busyFor.has(timeSlot)))
      // Balance the grid rather than filling it front to back: front-loading crowds the block
      // where everyone is present, which is the clash the first criterion exists to avoid.
      .sort((a, b) => load(a.timeSlot) - load(b.timeSlot) || a.index - b.index)
      .map(({ timeSlot }) => {
        const free = roomsToUse.filter((room) => !occupied.has(`${room}|${timeSlot}`));
        const byThrift = [...free].sort((a, b) => surplus(a) - surplus(b));
        const track = [...free].sort((a, b) => talksIn(b) - talksIn(a))[0];

        return {
          timeSlot,
          // Thriftiest first, then whichever room is furthest along as a track — and if those are
          // the same room (an empty grid has no track yet), just the next thriftiest, so there is
          // still a room to choose between.
          rooms: [byThrift[0], track, ...byThrift]
            .filter((room, index, all) => room && all.indexOf(room) === index)
            .slice(0, ROOMS_PER_SLOT),
        };
      });

    // Round-robin: every block gets a candidate before any block gets a second room, so truncating
    // at MAX_CANDIDATES can no longer make the back half of the day unreachable.
    const cells: { room: string; timeSlot: string }[] = [];

    for (let rank = 0; rank < ROOMS_PER_SLOT; rank++) {
      for (const slot of slots) {
        const room = slot.rooms[rank];

        if (room) cells.push({ room, timeSlot: slot.timeSlot });
      }
    }

    return cells.slice(0, MAX_CANDIDATES);
  };

  // A speaker clash must not look like a full grid: if avoiding it leaves nothing, offer the
  // clashing cells anyway and let the staffer decide.
  const cells = collect(true).length > 0 ? collect(true) : collect(false);

  return cells.map((cell, index) => ({
    id: `c${index}`,
    room: cell.room,
    timeSlot: cell.timeSlot,
    hasTV: resourcesOf(cell.room)?.hasTV ?? false,
    hasWhiteboard: resourcesOf(cell.room)?.hasWhiteboard ?? false,
  }));
}

const INSTRUCTIONS = `Sos quien arma la grilla de un open space de la comunidad ágil uruguaya. Elegís dónde y cuándo va una charla nueva para que la gente pueda ver lo que le interesa.

Criterios, en orden:
1. Evitar choques temáticos: si en ese horario ya hay una charla del mismo tema, elegí otro horario.
2. Continuidad por sala: si una sala ya viene con charlas del mismo tema, sumar ahí ayuda a que la gente se quede. No mezcles temas distintos en la misma sala sin motivo.
3. Repartir la grilla: a igualdad de condiciones, preferí el bloque con menos charlas. Los candidatos ya vienen ordenados del bloque más libre al más cargado, así que ante la duda quedate con el primero que no genere choque.

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
    speaker,
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

    // Still hand back a usable cell — but flagged, because a dead gateway used to look exactly
    // like a working suggestion, and the reasoning that said otherwise was behind a collapsed panel.
    return {
      suggestedRoom: candidates[0].room,
      suggestedTimeSlot: candidates[0].timeSlot,
      reasoning: `La AI no respondió, así que este es simplemente el primer espacio libre. ${describeAiFailure(error)}`,
      degraded: true,
    };
  }
}
