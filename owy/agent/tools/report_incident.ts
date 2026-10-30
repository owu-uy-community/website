import { defineTool } from "eve/tools";
import { z } from "zod";
import { normalizeText, resolveActiveEvent } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import type { ToolSessionCtx } from "../lib/staff";

const CHANNELS: Record<string, string> = {
  "slack-webhook": "Slack",
  "telegram-webhook": "Telegram",
  companion: "el Owy físico",
  "companion-staff": "el Owy físico",
  "local-dev": "la consola",
  "http-basic": "la consola",
};

/** "Reportado a Owy por Ana (@ana), por Telegram": so the staff knows who to go back to. */
function reportedBy(ctx: ToolSessionCtx, reporter: string | undefined): string {
  const auth = ctx.session?.auth?.current;
  const handle = typeof auth?.attributes?.username === "string" ? `@${auth.attributes.username}` : null;
  const who = reporter ? (handle ? `${reporter} (${handle})` : reporter) : handle;
  const channel = CHANNELS[auth?.authenticator ?? ""];

  return `Reportado a Owy${who ? ` por ${who}` : ""}${channel ? `, por ${channel}` : ""}.`;
}

export default defineTool({
  description:
    "Registra un incidente del evento para que el staff lo vea al instante (Hoy, Incidentes y el teléfono de cada host): algo roto (proyector, audio, wifi), alguien que se siente mal, un objeto perdido o encontrado, un problema del lugar o una situación de código de conducta. Cualquiera puede reportar. Gravedad alta o crítica le avisa urgente a todo el staff, así que usala solo cuando corresponde; ante la duda, categoría 'other' y gravedad 'medium'.",
  inputSchema: z.object({
    title: z.string().min(3).max(140).describe("Qué pasa, en una línea: 'El proyector de Cueva no da imagen'"),
    description: z.string().max(3000).optional().describe("Lo que contó la persona y ayude a resolverlo"),
    category: z
      .enum(["medical", "conduct", "technical", "venue", "lost", "other"])
      .default("other")
      .describe(
        "medical: salud · conduct: código de conducta (acoso, alguien incómodo o agresivo) · technical: proyector, audio, wifi, stream · venue: el lugar (baños, agua, limpieza, puertas) · lost: objeto perdido o encontrado · other"
      ),
    severity: z
      .enum(["low", "medium", "high", "critical"])
      .default("medium")
      .describe(
        "critical: riesgo para alguien ahora (salud, seguridad) · high: frena una sala o el evento · medium: el resto (default) · low: menor o puede esperar (casi siempre los perdidos)"
      ),
    room: z.string().optional().describe("La sala donde pasa, si es en una (nombre)"),
    location: z.string().max(120).optional().describe("El lugar si no es una sala: 'baños de planta baja', 'entrada'"),
    reporter: z.string().max(120).optional().describe("Nombre de quien lo reporta, si lo sabés, para que el staff lo ubique"),
    sensitive: z
      .boolean()
      .optional()
      .describe("Confidencial: solo lo ven los organizadores. Por defecto, sí para 'conduct' y no para el resto."),
  }),
  async execute(input, ctx) {
    const event = await resolveActiveEvent();
    const api = owuApi();

    // A room by (accent-insensitive) name; anything else is just a place.
    let roomId: string | undefined;
    let location = input.location;
    if (input.room) {
      const needle = normalizeText(input.room);
      const matches = (await api.rooms.getByOpenSpace({ openSpaceId: event.id })).filter((room) =>
        normalizeText(room.name).includes(needle)
      );
      if (matches.length === 1) roomId = matches[0].id;
      else location ??= input.room;
    }

    const incident = await api.incidents.create({
      eventId: event.id,
      title: input.title,
      description: [input.description, reportedBy(ctx, input.reporter)].filter(Boolean).join("\n\n"),
      category: input.category,
      severity: input.severity,
      ...(roomId ? { roomId } : {}),
      ...(location ? { location } : {}),
      sensitive: input.sensitive ?? input.category === "conduct",
    });

    return {
      ok: true,
      incident: {
        id: incident.id,
        title: incident.title,
        category: incident.category,
        severity: incident.severity,
        where: incident.room?.name ?? incident.location,
        confidential: incident.sensitive,
      },
      /** True when the whole staff got an urgent announcement about it. */
      staffAlerted: incident.severity === "high" || incident.severity === "critical",
    };
  },
});
