import { experimental_decide, type Experimental_DecisionModel } from "ai";

import { DECISION_TIMEOUT_MS, describeAiFailure, SLOT_DECISION_MODEL } from "./models";
import type { FindFreeSpotResponse } from "./schemas";

/**
 * How many free cells get scored. Every candidate is a cell we already know is free and
 * resource-compatible, so nothing impossible can be suggested; fewer cells also means fewer blocks
 * and rooms to ask the model about.
 */
const MAX_CANDIDATES = 12;

/**
 * Free rooms offered per time slot: the thriftiest one, and the one that is already becoming a
 * track. Two, so room choice stays alive without asking about every room — and picked for *different*
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

/** The board as the picker sees it: names and labels, not ids. */
export interface Board {
  existingNotes: { title: string; speaker?: string; room: string; timeSlot: string }[];
  roomsWithResources: { name: string; hasTV: boolean; hasWhiteboard: boolean }[];
  availableRooms: string[];
  availableTimeSlots: string[];
}

/** The talk to place. */
export interface Talk {
  title: string;
  speaker?: string;
  /** What the talk is about when the title alone is thin (a spoken pitch); the topic questions see it. */
  description?: string;
  needsTV?: boolean;
  needsWhiteboard?: boolean;
  additionalContext?: string;
}

type CandidateInput = Board & Pick<Talk, "speaker" | "needsTV" | "needsWhiteboard">;

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
 * per block before any block gets a second, so when the model's answers leave two cells tied, the
 * earlier one — the emptier block — wins.
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
  // than something to ask the model about.
  const busyFor = new Set(existingNotes.filter((note) => sameName(speaker, note.speaker)).map((note) => note.timeSlot));

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

/**
 * How a candidate is scored from the model's yes/no probabilities. A same-topic clash outweighs
 * continuing a room's topic; an explicit staff request outweighs both (its probability is averaged
 * over block and room, so a clear yes vs no moves the score by ~0.5 × FIT); `ORDER` only breaks
 * ties in favour of the emptier block `buildCandidates` already put first.
 */
// ponytail: hand-set weights checked on one labelled board; tune with `pnpm slot:replay --llm`.
const WEIGHT = { CLASH: 3, AFFINITY: 1, FIT: 6, ORDER: 0.01 } as const;

/** A yes/no probability at or above this reads as "yes" in the explanation. */
const YES = 0.5;

interface Scored {
  candidate: Candidate;
  /** P(a talk in this block is about the same topic). */
  clash: number;
  /** P(this room already runs talks on a related topic). */
  affinity: number;
  /** P(this place satisfies the staff's request); null when there was no request. */
  fit: number | null;
  score: number;
}

const quote = (titles: string[]) => titles.map((title) => `«${title}»`).join(", ");
const startOf = (timeSlot: string) => timeSlot.split(" - ")[0];
const listOf = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} y ${items.at(-1)}` : (items[0] ?? "");

/** Why this place, in plain words, from the same probabilities that picked it. */
function explain(
  scored: Scored,
  { avoided, slotTalks }: { avoided: string[]; slotTalks: (timeSlot: string) => string[] }
): string {
  const { candidate, clash, affinity, fit } = scored;
  const sentences: string[] = [];

  if (fit !== null) {
    sentences.push(
      fit >= YES
        ? "Respeta el pedido del staff."
        : "Ningún lugar libre cumple del todo el pedido del staff; este es el que más se acerca."
    );
  }
  if (clash >= YES) {
    sentences.push("A esa hora ya hay una charla de un tema parecido, pero no quedó un lugar mejor.");
  } else {
    const others = avoided.filter((timeSlot) => timeSlot !== candidate.timeSlot).map(startOf);
    sentences.push(
      others.length > 0
        ? `No choca con otra charla del mismo tema (las de las ${listOf(others)} sí lo harían).`
        : "No choca con otra charla del mismo tema."
    );
  }
  // The model judged the room's talks as a set, so no single talk can be named as the related one.
  if (affinity >= YES) sentences.push(`Sigue el hilo de ${candidate.room}, que ya tiene charlas de temas afines.`);
  const load = slotTalks(candidate.timeSlot).length;
  sentences.push(load === 0 ? "El bloque está vacío." : `El bloque ya tiene ${load} charla${load === 1 ? "" : "s"}.`);

  return sentences.join(" ");
}

/**
 * Suggest where to put a new talk: the free cells are computed here, a decision model only judges
 * topics, and the pick is arithmetic over its answers.
 *
 * Everything that can be arithmetic is arithmetic (which cells are free, which rooms have the
 * required resources, how loaded each block is). The model answers yes/no questions — does a block
 * already hold a talk on the same topic, does a room already run related talks, does a place meet
 * the staff's request — one per block or room, so the call stays the same size however full the
 * grid gets. Asking it to pick a cell outright was measurably worse: it mostly took the first one.
 */
export async function findFreeSpot(
  { title, speaker, description, needsTV = false, needsWhiteboard = false, additionalContext }: Talk,
  { existingNotes, roomsWithResources, availableRooms, availableTimeSlots }: Board,
  model: Experimental_DecisionModel = SLOT_DECISION_MODEL.primary
): Promise<FindFreeSpotResponse> {
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

  const request = additionalContext?.trim() || undefined;
  const slotTalks = (timeSlot: string) =>
    existingNotes.filter((note) => note.timeSlot === timeSlot).map((n) => n.title);
  const roomTalks = (room: string) => existingNotes.filter((note) => note.room === room).map((n) => n.title);
  const unique = (values: string[]) => [...new Set(values)];
  const slots = unique(candidates.map((candidate) => candidate.timeSlot));
  const rooms = unique(candidates.map((candidate) => candidate.room));
  const busySlots = slots.filter((timeSlot) => slotTalks(timeSlot).length > 0);
  const busyRooms = rooms.filter((room) => roomTalks(room).length > 0);

  // Nothing to compare against and nothing asked for: the emptiest block wins without a model.
  if (busySlots.length === 0 && busyRooms.length === 0 && !request) {
    const [first] = candidates;

    return {
      suggestedRoom: first.room,
      suggestedTimeSlot: first.timeSlot,
      reasoning: "Todavía no hay charlas con las que pueda chocar: va al primer lugar libre.",
    };
  }

  type Question = { type: "boolean"; instructions: string; criteria?: { true: string; false: string } };
  const questions: Record<string, Question> = {};
  busySlots.forEach((timeSlot, index) => {
    questions[`bloque${index}`] = {
      type: "boolean",
      instructions: `¿Alguna de estas charlas, que son a la misma hora, trata el mismo tema que la charla nueva? ${quote(slotTalks(timeSlot))}`,
      criteria: {
        true: "Sí: a quien le interesa la nueva también querría ver una de estas, y se le superponen",
        false: "No: son de otros temas",
      },
    };
  });
  busyRooms.forEach((room, index) => {
    questions[`sala${index}`] = {
      type: "boolean",
      // Not naming the room: with the rooms in the state, Luna refuses a question it can't check
      // against it, and the topic doesn't depend on the room anyway.
      instructions: `¿Alguna de estas charlas, que son de una misma sala, es de un tema afín a la charla nueva? ${quote(roomTalks(room))}`,
      criteria: { true: "Sí: sumarla ahí le da continuidad al tema", false: "No: son de otros temas" },
    };
  });
  if (request) {
    slots.forEach((timeSlot, index) => {
      questions[`pedidoBloque${index}`] = {
        type: "boolean",
        instructions: `¿Poner la charla en el bloque ${timeSlot} cumple el pedido del staff?`,
      };
    });
    rooms.forEach((room, index) => {
      questions[`pedidoSala${index}`] = {
        type: "boolean",
        instructions: `¿Poner la charla en la sala ${room} cumple el pedido del staff?`,
      };
    });
  }

  const state = {
    charlaNueva: {
      titulo: title,
      ...(speaker ? { orador: speaker } : {}),
      ...(description ? { descripcion: description } : {}),
    },
    // With a request, the whole day and every room, so "la última hora" can be judged block by block.
    ...(request ? { pedidoDelStaff: request, bloquesDelDia: availableTimeSlots, salas: availableRooms } : {}),
  };

  // Only the topic questions decide whether jev was unsure enough to ask Luna: a block or room the
  // staff's request doesn't mention is legitimately a coin flip.
  const topicQuestions = Object.keys(questions).filter((id) => id.startsWith("bloque") || id.startsWith("sala"));
  const fallbacks = {
    gateway: {
      models: [
        ...(topicQuestions.length > 0
          ? [
              {
                model: SLOT_DECISION_MODEL.unsure,
                when: {
                  any: topicQuestions.map((question) => ({
                    question,
                    probabilityBetween: [...SLOT_DECISION_MODEL.unsureBand],
                  })),
                },
              },
            ]
          : []),
        SLOT_DECISION_MODEL.failover,
      ],
    },
  };

  const decide = (withFallbacks: boolean) =>
    experimental_decide({
      model,
      state,
      questions,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(DECISION_TIMEOUT_MS),
      ...(withFallbacks ? { providerOptions: fallbacks } : {}),
    });

  try {
    // A fallback model that is briefly unavailable fails the whole request; asking jev alone once
    // more is cheaper than handing the staffer an unjudged first cell.
    const result = await decide(true).catch((error: unknown) => {
      console.warn("[slot] decision with fallbacks failed, asking the primary alone:", describeAiFailure(error));

      return decide(false);
    });
    if (result.response.modelId && result.response.modelId !== SLOT_DECISION_MODEL.primary) {
      console.info(`[slot] decided by ${result.response.modelId}`);
    }

    const yes = (id: string) => {
      const answer = result.answers[id];

      return answer?.type === "boolean" ? answer.probability : 0;
    };
    const clashAt = (timeSlot: string) =>
      busySlots.includes(timeSlot) ? yes(`bloque${busySlots.indexOf(timeSlot)}`) : 0;
    const affinityOf = (room: string) => (busyRooms.includes(room) ? yes(`sala${busyRooms.indexOf(room)}`) : 0);
    const fitOf = (candidate: Candidate) =>
      request
        ? (yes(`pedidoBloque${slots.indexOf(candidate.timeSlot)}`) +
            yes(`pedidoSala${rooms.indexOf(candidate.room)}`)) /
          2
        : null;

    const ranked: Scored[] = candidates
      .map((candidate, order) => {
        const clash = clashAt(candidate.timeSlot);
        const affinity = affinityOf(candidate.room);
        const fit = fitOf(candidate);
        const score =
          -WEIGHT.CLASH * clash + WEIGHT.AFFINITY * affinity + WEIGHT.FIT * (fit ?? 0) - WEIGHT.ORDER * order;

        return { candidate, clash, affinity, fit, score };
      })
      .sort((a, b) => b.score - a.score);

    const context = {
      // In the day's order, not the candidates' (emptiest first).
      avoided: availableTimeSlots.filter((timeSlot) => busySlots.includes(timeSlot) && clashAt(timeSlot) >= YES),
      slotTalks,
    };
    const [best, ...rest] = ranked;

    return {
      suggestedRoom: best.candidate.room,
      suggestedTimeSlot: best.candidate.timeSlot,
      reasoning: explain(best, context),
      alternatives: rest.slice(0, 2).map((scored) => ({
        room: scored.candidate.room,
        timeSlot: scored.candidate.timeSlot,
        reasoning: explain(scored, context),
      })),
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
