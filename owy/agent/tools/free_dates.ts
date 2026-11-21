import { defineTool } from "eve/tools";
import { z } from "zod";
import { owuApi, type PlanDay } from "../lib/owu-api";

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

/** "2026-11" for this month, or the next one when `next` */
const monthOf = (offset: number) => {
  const now = new Date();
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return at.toISOString().slice(0, 7);
};

export default defineTool({
  description:
    "Fechas libres para un meetup de una comunidad de OWU: el calendario compartido de Organizá puntúa cada día del mes (choques con otras comunidades de público parecido, feriados, vacaciones, eventos grandes) y sugiere los mejores. Usala cuando alguien pregunte qué fecha conviene, qué días están libres o si un día choca. Devuelve solo información pública: eventos publicados, nunca las reservas de otras comunidades.",
  inputSchema: z.object({
    community: z.string().describe("La comunidad que organiza: su nombre o slug (ej: 'Python Montevideo', 'montevideojs')"),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional()
      .describe("Mes AAAA-MM; si no se dice, el mes que viene"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("Hora de inicio HH:MM (por defecto 19:00)"),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Un día puntual a evaluar (AAAA-MM-DD)"),
  }),
  async execute({ community, month, startTime, day }) {
    const api = owuApi();
    const wanted = fold(community);
    const all = await api.communities.list({});
    const found =
      all.find((item) => item.slug === wanted || fold(item.name) === wanted) ??
      all.find((item) => fold(item.name).includes(wanted) || item.slug.includes(wanted.replace(/\s+/g, "")));
    if (!found) {
      return { error: `No encontré la comunidad «${community}» en OWU.`, communities: all.filter((item) => item.listed).map((item) => item.name) };
    }

    const plan = await api.calendar.plan({
      communityId: found.id,
      month: month ?? day?.slice(0, 7) ?? monthOf(1),
      ...(startTime ? { startTime } : {}),
    });
    // Other communities' holds are for organizers in the panel. Allow-list: a reason about an item
    // stays only when that item is a published event of this month (a hold just across the month's
    // edge isn't in `items`, so a deny-list would let its reason through)
    const published = new Set(plan.items.filter((item) => item.kind === "event").map((item) => item.id));
    const publicDay = (entry: PlanDay) => ({
      day: entry.day,
      level: entry.level,
      score: entry.score,
      reasons: entry.reasons
        .filter((reason) => !reason.itemId || published.has(reason.itemId))
        .map((reason) => reason.text),
    });

    return {
      community: found.name,
      month: month ?? day?.slice(0, 7) ?? monthOf(1),
      levels: "libre (≥80) · cuidado (50–79) · choca (<50) · bloqueado",
      ...(day ? { day: plan.days.filter((entry) => entry.day === day).map(publicDay)[0] ?? null } : {}),
      suggestions: plan.suggestions.map(publicDay),
      otherEvents: plan.items
        .filter((item) => item.kind === "event")
        .map((item) => ({ community: item.communityName, title: item.title, start: item.start, url: item.url ?? null })),
      panel: "Para reservar una fecha: owu.uy/organizar/panel (calendario)",
    };
  },
});
