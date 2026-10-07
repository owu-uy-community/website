import { isChannel } from "eve/channels";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import companion from "../channels/companion";
import { findRoom, findSchedule, getBoard } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { isStaff } from "../lib/staff";

/**
 * Tools that only exist when the turn comes from a physical Owy
 * (`agent/channels/companion.ts`).
 *
 * `propose_talk` is the marketplace flow for *attendees*: it writes a card the
 * way `create_track` does but replaces the staff gate with the kiosk policy
 * (marketplace open + a per-device cooldown), because the person standing in
 * front of the device is never staff by default.
 */

const COOLDOWN_MS = Number(process.env.COMPANION_PROPOSAL_COOLDOWN_S ?? 60) * 1000;

export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      if (!isChannel(ctx.channel, companion)) return null;
      // A pitch's card already exists (the bridge placed it): nothing to propose in that turn.
      if (ctx.channel.metadata.kind === "pitch") return null;
      // Snapshot (JSON) for the durable callback: the channel updates it from
      // `action.result` after every accepted proposal.
      const lastProposalAt = ctx.channel.metadata.lastProposalAt ?? null;

      return {
        propose_talk: defineTool({
          description:
            "Carga en la grilla del open space una charla propuesta en el mercado de ideas. Usala SOLO después de confirmar en voz alta título, speaker, sala y horario con la persona. Funciona mientras el mercado de ideas está abierto (o en modo staff).",
          inputSchema: z.object({
            title: z.string().min(2).describe("Título de la charla, como lo dijo la persona"),
            speaker: z.string().min(1).describe("Nombre de quien la da"),
            room: z.string().min(1).describe("Sala elegida (nombre)"),
            timeSlot: z.string().min(1).describe("Horario elegido (nombre del bloque o hora, ej: '15:30')"),
            needsTV: z.boolean().optional().describe("Necesita tele/proyector"),
            needsWhiteboard: z.boolean().optional().describe("Necesita pizarra"),
            description: z.string().optional().describe("Una línea opcional sobre el tema"),
          }),
          async execute(input, toolCtx) {
            const staff = isStaff(toolCtx);
            const marketplaceOpen = toolCtx.session.auth.current?.attributes?.marketplace_open === "true";
            if (!staff && !marketplaceOpen) {
              return {
                ok: false,
                error:
                  "El mercado de ideas está cerrado en este momento: las propuestas se toman solo durante el mercado. Que hablen con el staff.",
              };
            }
            if (!staff && lastProposalAt !== null && Date.now() - lastProposalAt < COOLDOWN_MS) {
              const wait = Math.ceil((COOLDOWN_MS - (Date.now() - lastProposalAt)) / 1000);
              return { ok: false, error: `Acabo de cargar una propuesta; esperá ${wait} segundos para la siguiente.` };
            }

            const board = await getBoard();
            const room = findRoom(board, input.room);
            const schedule = findSchedule(board, input.timeSlot);
            const created = await owuApi().tracks.create({
              title: input.title,
              speaker: input.speaker,
              description: input.description,
              needsTV: input.needsTV ?? false,
              needsWhiteboard: input.needsWhiteboard ?? false,
              openSpaceId: board.openSpace.id,
              scheduleId: schedule.id,
              roomId: room.id,
            });
            return {
              ok: true,
              card: {
                id: created.id,
                title: created.title,
                speaker: created.speaker ?? null,
                room: created.room ?? room.name,
                timeSlot: created.timeSlot ?? `${schedule.startTime} - ${schedule.endTime}`,
              },
            };
          },
        }),
      };
    },
  },
});
