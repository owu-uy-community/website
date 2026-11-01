import { z } from "zod";

/**
 * `propose_talk`, the marketplace flow for attendees, as both brains offer it:
 * eve's companion tool (`agent/tools/companion.ts`) and the bridge's local
 * brain (`companion/bridge/src/realtime/tools.ts`). It writes a card the way
 * `create_track` does, with the kiosk policy instead of the staff gate.
 */
export const PROPOSE_TALK_DESCRIPTION =
  "Carga en la grilla del open space una charla propuesta en el mercado de ideas. Usala SOLO después de confirmar en voz alta título, speaker, sala y horario con la persona. Funciona mientras el mercado de ideas está abierto (o en modo staff).";

export const ProposeTalkSchema = z.object({
  title: z.string().min(2).describe("Título de la charla, como lo dijo la persona"),
  speaker: z.string().min(1).describe("Nombre de quien la da"),
  room: z.string().min(1).describe("Sala elegida (nombre)"),
  timeSlot: z.string().min(1).describe("Horario elegido (nombre del bloque o hora, ej: '15:30')"),
  needsTV: z.boolean().optional().describe("Necesita tele/proyector"),
  needsWhiteboard: z.boolean().optional().describe("Necesita pizarra"),
  description: z.string().optional().describe("Una línea opcional sobre el tema"),
});

/** Why this device can't propose a talk right now, or null: staff always can; anyone else while the marketplace is open, one per cooldown. */
export function proposalRefusal(input: {
  staff: boolean;
  marketplaceOpen: boolean;
  lastAt: number | null;
  now: number;
  cooldownMs: number;
}): string | null {
  if (input.staff) return null;
  if (!input.marketplaceOpen)
    return "El mercado de ideas está cerrado en este momento: las propuestas se toman solo durante el mercado. Que hablen con el staff.";
  const since = input.lastAt === null ? Infinity : input.now - input.lastAt;
  if (since < input.cooldownMs) return `Acabo de cargar una propuesta; esperá ${Math.ceil((input.cooldownMs - since) / 1000)} segundos para la siguiente.`;
  return null;
}
