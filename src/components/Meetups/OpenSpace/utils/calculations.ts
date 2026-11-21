import type { StickyNote } from "../../../../lib/orpc";

/**
 * Find existing note in a cell
 */
export const findNoteInCell = (
  notes: StickyNote[],
  room: string,
  timeSlot: string,
  excludeId?: string
): StickyNote | null => {
  for (const note of notes) {
    if (note.room === room && note.timeSlot === timeSlot && note.id !== excludeId) {
      return note;
    }
  }
  return null;
};

/** Lowercase and without accents: on a phone "mujica" has to find "Mújica". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Filter notes based on search term
 */
export const filterNotes = (notes: StickyNote[], searchTerm: string): StickyNote[] => {
  const term = fold(searchTerm.trim());
  if (!term) return notes;

  return notes.filter(
    (note) => fold(note.title).includes(term) || (note.speaker ? fold(note.speaker).includes(term) : false)
  );
};
