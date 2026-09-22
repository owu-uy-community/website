import * as z from "zod";

import type { StickyNote } from "lib/orpc";

export const talkFormSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  speaker: z.string(),
  room: z.string().min(1, "La sala es requerida"),
  timeSlot: z.string().min(1, "El horario es requerido"),
  needsTV: z.boolean(),
  needsWhiteboard: z.boolean(),
});

export type TalkFormData = z.infer<typeof talkFormSchema>;

export interface RoomWithResources {
  id: string;
  name: string;
  hasTV: boolean;
  hasWhiteboard: boolean;
}

export interface SuggestionAlternative {
  room: string;
  timeSlot: string;
  reasoning: string;
}

export interface SuggestionEntry {
  room: string;
  timeSlot: string;
  reasoning: string;
  alternatives?: SuggestionAlternative[];
  /** The AI call failed and this is just the first free cell — say so instead of pretending. */
  degraded?: boolean;
}

/** A form field the OCR flagged as hard to read, so the staffer checks it before saving. */
export type ReviewableField = "speaker" | "title" | "requisito";

export interface ScheduleSlot {
  room: string;
  timeSlot: string;
}

export interface TalkFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openSpaceId: string;
  note: StickyNote | null;
  notes: StickyNote[];
  rooms: string[];
  roomsData: RoomWithResources[];
  timeSlots: string[];
  onSave: (noteData: Partial<StickyNote> & { skipResourceValidation?: boolean }) => void;
  onDelete?: () => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}
