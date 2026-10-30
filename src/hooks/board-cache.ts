import type { StickyNote } from "../lib/orpc";

/** The id an optimistic card carries until the server answers with the real row. */
export const isOptimistic = (note: StickyNote) => note.id.startsWith("temp-");

/**
 * A card created on some screen, as the realtime broadcast tells it. If it is this screen's own
 * create, still optimistic in the same place, the real card takes its place: appending it would
 * show the talk twice until the create's own answer arrives (a place holds a single talk).
 */
export function withCreatedCard(notes: StickyNote[], card: StickyNote): StickyNote[] {
  if (notes.some((note) => note.id === card.id)) return notes;
  const pending = notes.findIndex(
    (note) => isOptimistic(note) && note.room === card.room && note.timeSlot === card.timeSlot
  );
  if (pending < 0) return [...notes, card];

  return notes.map((note, index) => (index === pending ? card : note));
}

/** The create's own answer: the real row replaces the optimistic one, whichever arrived first. */
export function settleCreatedCard(notes: StickyNote[], created: StickyNote, optimisticId?: string): StickyNote[] {
  if (notes.some((note) => note.id === created.id)) return notes.filter((note) => note.id !== optimisticId);

  return notes.map((note) => (note.id === optimisticId ? created : note));
}
