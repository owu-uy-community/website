import { isChannel } from "eve/channels";
import { defineDynamic, defineTool } from "eve/tools";
import companion from "../channels/companion";
import { findRoom, findSchedule, getBoard } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { PROPOSE_TALK_DESCRIPTION, ProposeTalkSchema, proposalRefusal } from "../lib/proposals";
import { isCompanionStaff } from "../lib/staff";

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

export default defineDynamic((ctx) => {
  if (!isChannel(ctx.channel, companion)) return null;
  // A pitch's card already exists (the bridge placed it), and a talk on stage is no marketplace: nothing to propose.
  const kind = ctx.session.auth.current?.attributes?.turn_kind;
  if (kind === "pitch" || kind === "talk") return null;
  // Read before every model call: the channel updates it from `call.settled` after every
  // accepted proposal.
  const lastProposalAt = ctx.channel.metadata.lastProposalAt ?? null;

  return {
    propose_talk: defineTool({
      description: PROPOSE_TALK_DESCRIPTION,
      inputSchema: ProposeTalkSchema,
      async execute(input, toolCtx) {
        // The device unlocked with its PIN is staff mode; the kiosk is anyone (the marketplace rules)
        const refusal = proposalRefusal({
          staff: isCompanionStaff(toolCtx),
          marketplaceOpen: toolCtx.session.auth.current?.attributes?.marketplace_open === "true",
          lastAt: lastProposalAt,
          now: Date.now(),
          cooldownMs: COOLDOWN_MS,
        });
        if (refusal) return { ok: false, error: refusal };

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
});
