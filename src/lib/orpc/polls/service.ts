import { and, arrayContains, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { Effect, Option } from "effect";

import { dayKey, shortWhen, montevideoIso } from "../../community/time";
import { communities, communityMembers, datePolls, datePollVotes, events, user } from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, datePollEmail } from "../../email/templates";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { setCohosts } from "../events/cohosts";
import { hold } from "../events/service";
import { CommunityScope, CurrentUser } from "../services";
import type { CreatePollInput, Poll } from "./schemas";

type PollRow = typeof datePolls.$inferSelect;

const notFound = new NotFound({ entity: "poll", message: "Esa encuesta no existe" });

/** Polls as a community sees them: everyone's answers, by community and day. */
const viewOf = (polls: PollRow[], communityId: string) =>
  Effect.gen(function* () {
    if (polls.length === 0) return [];
    const ids = [...new Set(polls.flatMap((poll) => [poll.communityId, ...poll.invited]))];
    const [names, votes] = yield* Effect.all([
      query((db) =>
        db.select({ id: communities.id, name: communities.name }).from(communities).where(inArray(communities.id, ids))
      ),
      query((db) =>
        db
          .select()
          .from(datePollVotes)
          .where(
            inArray(
              datePollVotes.pollId,
              polls.map((poll) => poll.id)
            )
          )
      ),
    ]);
    const nameOf = new Map(names.map((row) => [row.id, row.name]));

    return polls.map((poll): Poll => ({
      id: poll.id,
      title: poll.title,
      days: poll.days,
      startTime: poll.startTime,
      durationMin: poll.durationMin,
      mine: poll.communityId === communityId,
      asker: { id: poll.communityId, name: nameOf.get(poll.communityId) ?? "" },
      communities: [poll.communityId, ...poll.invited].map((id) => ({
        id,
        name: nameOf.get(id) ?? "",
        answers: Object.fromEntries(
          votes
            .filter((vote) => vote.pollId === poll.id && vote.communityId === id)
            .map((vote) => [vote.day, vote.answer])
        ),
      })),
      chosenDay: poll.chosenDay,
      eventId: poll.eventId,
      createdAt: poll.createdAt.toISOString(),
    }));
  });

/** The polls this community asked and the ones it's invited to, newest first. */
export const list = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const polls = yield* query((db) =>
    db
      .select()
      .from(datePolls)
      .where(or(eq(datePolls.communityId, communityId), arrayContains(datePolls.invited, [communityId])))
      .orderBy(desc(datePolls.createdAt))
      .limit(20)
  );

  return yield* viewOf(polls, communityId);
});

/** Ask other communities which of a few days works; their organizers get an email. */
export const create = (input: Omit<CreatePollInput, "communityId">) =>
  // One transaction: the poll and its emails are queued together, or neither is
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const actor = yield* Effect.serviceOption(CurrentUser);
      const today = dayKey(new Date());
      const days = [...new Set(input.days)].toSorted();
      if (days.some((day) => day < today)) return yield* new Invalid({ message: "Una de las fechas ya pasó" });
      const invited = [...new Set(input.invited)].filter((id) => id !== communityId);
      const found = yield* query((db) =>
        db
          .select({ id: communities.id, name: communities.name, slug: communities.slug })
          .from(communities)
          .where(and(inArray(communities.id, invited), eq(communities.isActive, true)))
      );
      if (invited.length === 0 || found.length !== invited.length) {
        return yield* new Invalid({ message: "Invitá comunidades que estén en OWU" });
      }

      const [poll] = yield* query((db) =>
        db
          .insert(datePolls)
          .values({
            communityId,
            title: input.title,
            days,
            startTime: input.startTime,
            durationMin: input.durationMin,
            invited,
            createdById: Option.isSome(actor) ? actor.value.id : null,
          })
          .returning()
      );
      const [asker] = yield* query((db) =>
        db.select({ name: communities.name }).from(communities).where(eq(communities.id, communityId))
      );
      const organizers = yield* query((db) =>
        db
          .select({ communityId: communityMembers.communityId, email: user.email })
          .from(communityMembers)
          .innerJoin(user, eq(user.id, communityMembers.userId))
          .where(
            and(
              inArray(communityMembers.communityId, invited),
              inArray(communityMembers.role, ["owner", "admin", "editor"])
            )
          )
      );
      const when = days.map((day) => shortWhen(montevideoIso(`${day}T${input.startTime}`)));
      for (const organizer of organizers) {
        const community = found.find((row) => row.id === organizer.communityId);
        if (!community) continue;
        yield* enqueueEmail({
          kind: "date_poll",
          to: organizer.email,
          priority: 4,
          dedupeKey: `date_poll:${poll.id}:${community.id}:${organizer.email}`,
          ...datePollEmail({
            asker: asker?.name ?? "Una comunidad",
            community: community.name,
            title: input.title,
            days: when,
            panelUrl: appUrl(`/organizar/panel/${community.slug}/encuestas`),
          }),
        });
      }

      return (yield* viewOf([poll], communityId))[0];
    })
  );

/** A poll the community asked or was invited to. Locked: a vote and a pick never cross. */
const pollFor = (pollId: string, communityId: string) =>
  Effect.gen(function* () {
    const [poll] = yield* query((db) => db.select().from(datePolls).where(eq(datePolls.id, pollId)).for("update"));
    if (!poll || (poll.communityId !== communityId && !poll.invited.includes(communityId))) return yield* notFound;

    return poll;
  });

/** This community's answers (any of its organizers can change them until a date is picked). */
export const vote = (input: { pollId: string; votes: { day: string; answer: "yes" | "maybe" | "no" }[] }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const actor = yield* Effect.serviceOption(CurrentUser);
      const poll = yield* pollFor(input.pollId, communityId);
      if (poll.chosenDay) return yield* new Conflict({ reason: "closed", message: "Ya eligieron la fecha" });
      if (input.votes.some((entry) => !poll.days.includes(entry.day))) {
        return yield* new Invalid({ message: "Esa fecha no está en la encuesta" });
      }
      for (const entry of input.votes) {
        const values = { answer: entry.answer, votedById: Option.isSome(actor) ? actor.value.id : null };
        yield* query((db) =>
          db
            .insert(datePollVotes)
            .values({ pollId: poll.id, communityId, day: entry.day, ...values })
            .onConflictDoUpdate({
              target: [datePollVotes.pollId, datePollVotes.communityId, datePollVotes.day],
              set: values,
            })
        );
      }

      return (yield* viewOf([poll], communityId))[0];
    })
  );

/**
 * Pick the date (the asking community only): it's reserved for 14 days like any hold, and the
 * communities that said yes to it are added as co-hosts (invited, unless the person runs them too).
 */
export const choose = (input: { pollId: string; day: string }) =>
  // One transaction: if the hold fails (too many reserved dates, say), the poll stays open
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const poll = yield* pollFor(input.pollId, communityId);
      if (poll.communityId !== communityId) return yield* notFound;
      if (poll.chosenDay) return yield* new Conflict({ reason: "closed", message: "Ya eligieron la fecha" });
      if (!poll.days.includes(input.day)) return yield* new Invalid({ message: "Esa fecha no está en la encuesta" });

      const [claimed] = yield* query((db) =>
        db
          .update(datePolls)
          .set({ chosenDay: input.day })
          .where(and(eq(datePolls.id, poll.id), isNull(datePolls.chosenDay)))
          .returning()
      );
      if (!claimed) return yield* new Conflict({ reason: "closed", message: "Ya eligieron la fecha" });
      const held = yield* hold({
        communityId,
        day: input.day,
        startTime: poll.startTime,
        durationMin: poll.durationMin,
        title: poll.title,
      });
      const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, held.id)));
      // Who said yes first goes first; a community no longer active can't co-host
      const yes = (yield* query((db) =>
        db
          .select({ communityId: datePollVotes.communityId })
          .from(datePollVotes)
          .innerJoin(communities, eq(communities.id, datePollVotes.communityId))
          .where(
            and(
              eq(datePollVotes.pollId, poll.id),
              eq(datePollVotes.day, input.day),
              eq(datePollVotes.answer, "yes"),
              eq(communities.isActive, true)
            )
          )
          .orderBy(asc(datePollVotes.updatedAt))
      ))
        .map((row) => row.communityId)
        .filter((id) => id !== communityId)
        .slice(0, 3);
      if (event && yes.length > 0) yield* setCohosts(event, yes);
      const [chosen] = yield* query((db) =>
        db.update(datePolls).set({ eventId: held.id }).where(eq(datePolls.id, poll.id)).returning()
      );

      return { poll: (yield* viewOf([chosen ?? claimed], communityId))[0], eventId: held.id };
    })
  );
