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

/**
 * Filter notes based on search term
 */
export const filterNotes = (notes: StickyNote[], searchTerm: string): StickyNote[] => {
  if (!searchTerm) return notes;

  const lowerSearchTerm = searchTerm.toLowerCase();
  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(lowerSearchTerm) || note.speaker?.toLowerCase().includes(lowerSearchTerm)
  );
};
