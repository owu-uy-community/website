import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { FindFreeSpotInput, FindFreeSpotResponse } from "../schemas";

/**
 * Use AI to find the best free spot for a new talk based on topic similarity
 * Avoids scheduling similar topics at the same time
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

  // Create a map for quick room resource lookup
  const roomResourceMap = new Map(
    roomsWithResources.map((r) => [r.name, { hasTV: r.hasTV, hasWhiteboard: r.hasWhiteboard }])
  );

  // Build occupancy map
  const occupiedSlots = new Set(existingNotes.map((note) => `${note.room}|${note.timeSlot}`));

  // Filter rooms ONLY if resources are explicitly required (needsTV or needsWhiteboard = true)
  // By default (false), any room is acceptable
  const eligibleRooms = availableRooms.filter((room) => {
    // If NO resources are required, ALL rooms are eligible
    if (!needsTV && !needsWhiteboard) return true;

    const resources = roomResourceMap.get(room);
    if (!resources) return true; // If no resource info, allow the room

    // Only filter out rooms that DON'T have EXPLICITLY REQUIRED resources
    if (needsTV && !resources.hasTV) return false;
    if (needsWhiteboard && !resources.hasWhiteboard) return false;

    return true;
  });

  // If no eligible rooms meet requirements, use all rooms (will show error to user later)
  const roomsToUse = eligibleRooms.length > 0 ? eligibleRooms : availableRooms;

  // Get all possible free slots from eligible rooms
  const freeSlots = roomsToUse.flatMap((room) =>
    availableTimeSlots
      .filter((timeSlot) => !occupiedSlots.has(`${room}|${timeSlot}`))
      .map((timeSlot) => ({ room, timeSlot }))
  );

  // If no free slots, return first available
  if (freeSlots.length === 0) {
    return {
      suggestedRoom: availableRooms[0] || "",
      suggestedTimeSlot: availableTimeSlots[0] || "",
      reasoning: "No hay espacios libres disponibles. Se sugiere el primer espacio disponible.",
    };
  }

  // Build comprehensive schedule overview with room resources
  const scheduleOverview = availableTimeSlots.map((timeSlot) => {
    const talksAtThisTime = existingNotes.filter((note) => note.timeSlot === timeSlot);
    const occupiedRooms = talksAtThisTime.map((t) => t.room);
    const freeRoomsAtThisTime = roomsToUse.filter((room) => !occupiedRooms.includes(room));

    return {
      timeSlot,
      totalRooms: availableRooms.length,
      occupiedRooms: occupiedRooms.length,
      freeRooms: freeRoomsAtThisTime.length,
      freeRoomsList: freeRoomsAtThisTime.map((room) => {
        const resources = roomResourceMap.get(room);
        return `${room}${resources ? ` (${resources.hasTV ? "TV" : ""}${resources.hasTV && resources.hasWhiteboard ? ", " : ""}${resources.hasWhiteboard ? "Whiteboard" : ""})` : ""}`;
      }),
      talks: talksAtThisTime.map((n) => ({
        title: n.title,
        speaker: n.speaker || "Unknown",
        room: n.room,
        needsTV: n.needsTV,
        needsWhiteboard: n.needsWhiteboard,
      })),
    };
  });

  // Create a detailed view of all scheduled talks
  const allScheduledTalks = existingNotes.map((note) => ({
    title: note.title,
    speaker: note.speaker || "Unknown",
    room: note.room,
    timeSlot: note.timeSlot,
  }));

  try {
    // Use AI to find best spot
    const { object } = await generateObject({
      model: openai("gpt-4.1"),
      temperature: 0.6,
      schema: z.object({
        bestRoom: z.string().describe("The suggested room name"),
        bestTimeSlot: z.string().describe("The suggested time slot"),
        reasoning: z.string().describe("Brief explanation (2-3 sentences max) of why this spot was chosen"),
        topicSimilarities: z
          .array(z.string())
          .optional()
          .describe("List of talks with similar topics in the SAME category (e.g., both technical or both leadership)"),
        alternatives: z
          .array(
            z.object({
              room: z.string().describe("Alternative room"),
              timeSlot: z.string().describe("Alternative time slot"),
              reasoning: z.string().describe("Brief 1-sentence reason why this alternative works"),
            })
          )
          .optional()
          .describe("Up to 2 alternative suggestions ranked by preference"),
        swapSuggestion: z
          .object({
            shouldSwap: z.boolean().describe("Whether a swap is recommended"),
            talkToSwap: z.string().optional().describe("Title of the talk to swap"),
            swapReasoning: z.string().optional().describe("Brief reason for the swap (1-2 sentences)"),
          })
          .optional()
          .describe("Only suggest swaps as LAST RESORT when no good free slots exist"),
      }),
      prompt: `You are an expert scheduler for an OpenSpace event. Maximize attendee satisfaction by avoiding topic conflicts and matching room requirements. Answer in Spanish.

NEW TALK: "${title}" by ${speaker}
${needsTV || needsWhiteboard ? `Required Resources: ${needsTV ? "TV" : ""}${needsTV && needsWhiteboard ? "+" : ""}${needsWhiteboard ? "Whiteboard" : ""}` : "No resource requirements"}
${additionalContext ? `Context: ${additionalContext}` : ""}

ROOM RESOURCES:
${roomsWithResources.map((r) => `${r.name}: TV:${r.hasTV ? "✓" : "✗"} WB:${r.hasWhiteboard ? "✓" : "✗"}`).join(" | ")}

SCHEDULE BY TIME SLOT:
${scheduleOverview
  .map(
    (ts) =>
      `${ts.timeSlot} - Free:${ts.freeRooms}/${ts.totalRooms} (${ts.freeRoomsList.join(", ") || "None"})${ts.talks.length ? `\n  Scheduled: ${ts.talks.map((t) => `"${t.title}" (${t.room})`).join("; ")}` : ""}`
  )
  .join("\n")}

TOPIC CONTINUITY BY ROOM (analyze category match):
${availableRooms
  .map((room) => {
    const talks = existingNotes.filter((n) => n.room === room);
    return talks.length
      ? `${room}: ${talks.map((t) => `"${t.title}"`).join(", ")}`
      : `${room}: Empty (open for any topic)`;
  })
  .join("\n")}
→ Key: Keep talks in SAME category together in one room. Separate categories should use different rooms.

AVAILABLE FREE SLOTS:
${freeSlots
  .map((slot, i) => {
    const r = roomResourceMap.get(slot.room);
    return `${i + 1}. ${slot.room} ${r ? `(TV:${r.hasTV ? "✓" : "✗"} WB:${r.hasWhiteboard ? "✓" : "✗"})` : ""} @ ${slot.timeSlot}`;
  })
  .join("\n")}

TOPIC CATEGORIES (use for similarity analysis):
- Technical: Programming languages, frameworks, DevOps, architecture, databases, AI/ML, testing
- Leadership: Team management, hiring, culture, organizational change
- Soft Skills: Communication, career growth, mentoring, work-life balance
- Business: Product, strategy, entrepreneurship, growth
→ IMPORTANT: Only group talks within the SAME category. Don't mix technical with leadership/soft skills!

PRIORITY ORDER:
1. ${needsTV || needsWhiteboard ? `RESOURCE MATCH (MANDATORY): Must have ${needsTV ? "TV" : ""}${needsTV && needsWhiteboard ? "+" : ""}${needsWhiteboard ? "WB" : ""}. Exclude non-matching rooms.` : "No resource constraints - all rooms eligible."}
2. TOPIC CONTINUITY IN ROOM (HIGH PRIORITY): Analyze previous talks in room. Only group talks in SAME category (e.g., technical with technical, leadership with leadership). Never mix categories.
3. AVOID TIME CONFLICTS: Don't schedule at same time as similar topics within same category.
4. TIME OPTIMIZATION: Prefer earlier slots when no conflicts.
${additionalContext ? `5. ADDITIONAL CONTEXT: ${additionalContext}` : ""}

DECISION (Spanish, be brief):
- bestRoom & bestTimeSlot: From available free slots
- reasoning: 2-3 sentences max. ${needsTV || needsWhiteboard ? "State resource match. " : ""}Identify topic category (Technical/Leadership/Soft Skills/Business). Emphasize related talks in same category already in this room. Mention conflicts avoided.
- topicSimilarities: List similar talks in SAME category only
- alternatives: Up to 2 with 1-sentence reasoning each
- swapSuggestion: Only if needed

Example: "${needsTV || needsWhiteboard ? `[Room] tiene ${needsTV ? "TV" : ""}${needsTV && needsWhiteboard ? " y " : ""}${needsWhiteboard ? "pizarra" : ""}. ` : ""}Tema técnico que continúa línea de [talk técnica previa] en sala. Evita conflicto con [otra talk técnica] en otro horario."`,
    });

    // Validate AI response matches available options
    const selectedSlot = freeSlots.find(
      (slot) => slot.room === object.bestRoom && slot.timeSlot === object.bestTimeSlot
    );

    if (selectedSlot) {
      return {
        suggestedRoom: object.bestRoom,
        suggestedTimeSlot: object.bestTimeSlot,
        reasoning: object.reasoning,
        alternatives: object.alternatives,
        swapSuggestion: object.swapSuggestion,
      };
    } else {
      // Fallback to first free slot if AI returned invalid option
      console.warn("⚠️ AI returned invalid slot, using fallback:", {
        aiSuggestion: { room: object.bestRoom, timeSlot: object.bestTimeSlot },
        fallback: { room: freeSlots[0].room, timeSlot: freeSlots[0].timeSlot },
      });

      return {
        suggestedRoom: freeSlots[0].room,
        suggestedTimeSlot: freeSlots[0].timeSlot,
        reasoning:
          "Se seleccionó el primer espacio libre disponible (respuesta de AI no coincide con opciones disponibles).",
      };
    }
  } catch (error) {
    console.error("❌ Error finding free spot with AI:", error);
    // Fallback to first free slot
    return {
      suggestedRoom: freeSlots[0].room,
      suggestedTimeSlot: freeSlots[0].timeSlot,
      reasoning: "Se seleccionó el primer espacio libre disponible (error en AI).",
    };
  }
}
