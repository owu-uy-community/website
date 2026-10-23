import { and, asc, count, desc, eq, gt, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Effect } from "effect";

import { shortWhen } from "../../community/time";
import { topicLabel } from "../../community/topics";
import {
  communities,
  communityMembers,
  emailDeliveries,
  events,
  speakerProfiles,
  talkClaims,
  talkProposals,
  talkRequests,
  user,
  type EventRow,
  type SpeakerProfileRow,
  type TalkProposalRow,
} from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import * as Mail from "../../email/talk-templates";
import { appUrl } from "../../email/templates";
import { readLink, signLink } from "../../links";
import { addressedTo, claimState, LIVE_CLAIM, speakerEmailDue, withoutTalk, withTalk } from "../../organizar/talks";
import { eventPagePath, refreshEvent } from "../../revalidate";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { CommunityScope, CurrentUser } from "../services";
import {
  FORMAT_LABEL,
  type Card,
  type Claim,
  type InboxProposal,
  type MyProposal,
  type ProposalFields,
  type PublicSpeaker,
  type SpeakerProfile,
  type TalkRequest,
} from "./schemas";

const DAY = 86_400_000;
const EDITORS = ["owner", "admin", "editor"];
/** How long the thanks email's link takes slides and recordings */
const MATERIALS_DAYS = 30;

const proposalNotFound = new NotFound({ entity: "talk", message: "Esa propuesta no existe o ya no está abierta" });
const claimNotFound = new NotFound({ entity: "talk", message: "Esa charla no está tomada por esta comunidad" });
const linkNotFound = new NotFound({
  entity: "talk",
  message: "Este link ya no sirve: venció o está incompleto. Mandale los links a quien organiza.",
});

const speakerUrl = (userId: string) => `/charlas/oradores/${userId}`;
const panelUrl = (communitySlug: string) => appUrl(`/organizar/panel/${communitySlug}/charlas`);
const placeOf = (event: Pick<EventRow, "mode" | "placeName">) =>
  event.mode === "online" ? "Online" : (event.placeName ?? "Lugar a confirmar");

type EventBits = Pick<EventRow, "id" | "name" | "slug" | "startDate" | "status">;
const eventView = (event: EventBits, communitySlug: string) => ({
  id: event.id,
  name: event.name,
  startDate: event.startDate.toISOString(),
  status: event.status,
  url: event.status === "published" ? eventPagePath(communitySlug, event.slug) : null,
});

const proposalView = (row: TalkProposalRow) => ({
  id: row.id,
  title: row.title,
  abstract: row.abstract,
  format: row.format,
  level: row.level,
  topics: row.topics,
  language: row.language,
  firstTime: row.firstTime,
  recordingOk: row.recordingOk,
  speakerName: row.speakerName,
  createdAt: row.createdAt.toISOString(),
});

const speakerCard = (profile: SpeakerProfileRow | undefined) =>
  profile
    ? {
        bio: profile.bio,
        topics: profile.topics,
        languages: profile.languages,
        formats: profile.formats,
        links: profile.links,
        mentor: profile.mentor,
        url: profile.public ? speakerUrl(profile.userId) : null,
      }
    : null;

const profilesOf = (userIds: string[]) =>
  userIds.length === 0
    ? Effect.succeed(new Map<string, SpeakerProfileRow>())
    : query((db) => db.select().from(speakerProfiles).where(inArray(speakerProfiles.userId, userIds))).pipe(
        Effect.map((rows) => new Map(rows.map((row) => [row.userId, row])))
      );

const emailOf = (userId: string) =>
  query((db) => db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId))).pipe(
    Effect.map(([row]) => row ?? null)
  );

// ---------------------------------------------------------------------------
// The speaker: propose, edit, withdraw, their profile
// ---------------------------------------------------------------------------

/** The communities a proposal names, if every one is active in OWU. */
const activeCommunities = (ids: string[]) =>
  Effect.gen(function* () {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = yield* query((db) =>
      db
        .select({ id: communities.id })
        .from(communities)
        .where(and(inArray(communities.id, unique), eq(communities.isActive, true)))
    );
    if (found.length !== unique.length) {
      return yield* new Invalid({ message: "Elegí comunidades que estén en OWU, o «cualquiera de OWU»" });
    }

    return unique;
  });

/** Tell the editors of each community a proposal names (OWU-wide ones wait in the pool). Deduped. */
const notifyAddressed = (proposal: TalkProposalRow) =>
  Effect.gen(function* () {
    if (proposal.communityIds.length === 0) return;
    const organizers = yield* query((db) =>
      db
        .select({ communityId: communities.id, name: communities.name, slug: communities.slug, email: user.email })
        .from(communityMembers)
        .innerJoin(communities, eq(communities.id, communityMembers.communityId))
        .innerJoin(user, eq(user.id, communityMembers.userId))
        .where(
          and(inArray(communityMembers.communityId, proposal.communityIds), inArray(communityMembers.role, EDITORS))
        )
    );
    for (const organizer of organizers) {
      yield* enqueueEmail({
        kind: "talk_proposed",
        to: organizer.email,
        priority: 5,
        dedupeKey: `talk_proposed:${proposal.id}:${organizer.communityId}:${organizer.email}`,
        ...Mail.talkProposedEmail({
          community: organizer.name,
          speaker: proposal.speakerName,
          title: proposal.title,
          format: FORMAT_LABEL[proposal.format],
          abstract: proposal.abstract,
          firstTime: proposal.firstTime,
          panelUrl: panelUrl(organizer.slug),
        }),
      });
    }
  });

/** Propose a talk; the editors of the communities it names hear about it. */
export const propose = (input: ProposalFields) =>
  transaction(
    Effect.gen(function* () {
      const me = yield* CurrentUser;
      const communityIds = yield* activeCommunities(input.communityIds);
      const [proposal] = yield* query((db) =>
        db
          .insert(talkProposals)
          .values({ ...input, communityIds, speakerUserId: me.id })
          .returning()
      );
      yield* notifyAddressed(proposal);

      return { id: proposal.id };
    })
  );

/** One of the caller's own proposals, locked. */
const ownProposal = (proposalId: string) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const [proposal] = yield* query((db) =>
      db
        .select()
        .from(talkProposals)
        .where(and(eq(talkProposals.id, proposalId), eq(talkProposals.speakerUserId, me.id)))
        .for("update")
    );
    if (!proposal || proposal.status !== "open") return yield* proposalNotFound;

    return proposal;
  });

/** Edit an open proposal; a community added now hears about it, the others don't again. */
export const update = (input: ProposalFields & { proposalId: string }) =>
  transaction(
    Effect.gen(function* () {
      const { proposalId, ...fields } = input;
      yield* ownProposal(proposalId);
      const communityIds = yield* activeCommunities(fields.communityIds);
      const [proposal] = yield* query((db) =>
        db
          .update(talkProposals)
          .set({ ...fields, communityIds })
          .where(eq(talkProposals.id, proposalId))
          .returning()
      );
      yield* notifyAddressed(proposal);

      return { id: proposal.id };
    })
  );

/** Let the live claim go (withdrawn or archived), telling whoever took it when asked to. */
const releaseLive = (proposal: TalkProposalRow, { tell }: { tell: boolean }) =>
  Effect.gen(function* () {
    const released = yield* query((db) =>
      db
        .update(talkClaims)
        .set({ status: "released" })
        .where(and(eq(talkClaims.proposalId, proposal.id), inArray(talkClaims.status, [...LIVE_CLAIM])))
        .returning()
    );
    for (const claim of tell ? released : []) {
      if (!claim.claimedById) continue;
      const [organizer, [community]] = yield* Effect.all([
        emailOf(claim.claimedById),
        query((db) =>
          db.select({ slug: communities.slug }).from(communities).where(eq(communities.id, claim.communityId))
        ),
      ]);
      if (!organizer || !community) continue;
      yield* enqueueEmail({
        kind: "talk_withdrawn",
        to: organizer.email,
        priority: 4,
        dedupeKey: `talk_withdrawn:${claim.id}`,
        ...Mail.talkWithdrawnEmail({
          title: proposal.title,
          speaker: proposal.speakerName,
          panelUrl: panelUrl(community.slug),
        }),
      });
    }
  });

/** Withdraw a proposal: it leaves every inbox, and a community that had taken it is told. */
export const withdraw = (proposalId: string) =>
  transaction(
    Effect.gen(function* () {
      const proposal = yield* ownProposal(proposalId);
      yield* query((db) =>
        db.update(talkProposals).set({ status: "withdrawn" }).where(eq(talkProposals.id, proposalId))
      );
      yield* releaseLive(proposal, { tell: true });

      return { id: proposalId };
    })
  );

/** Spam or abuse, by OWU staff: out of every inbox, nobody told. */
export const archive = (proposalId: string) =>
  transaction(
    Effect.gen(function* () {
      const [proposal] = yield* query((db) =>
        db.update(talkProposals).set({ status: "archived" }).where(eq(talkProposals.id, proposalId)).returning()
      );
      if (!proposal) return yield* proposalNotFound;
      yield* releaseLive(proposal, { tell: false });

      return { id: proposalId };
    })
  );

/** The caller's proposals, newest first, each with who took it and where it goes. */
export const mine = Effect.gen(function* () {
  const me = yield* CurrentUser;
  const proposals = yield* query((db) =>
    db
      .select()
      .from(talkProposals)
      .where(and(eq(talkProposals.speakerUserId, me.id), inArray(talkProposals.status, ["open", "withdrawn"])))
      .orderBy(desc(talkProposals.createdAt))
      .limit(50)
  );
  const claims =
    proposals.length === 0
      ? []
      : yield* query((db) =>
          db
            .select({ claim: talkClaims, community: { name: communities.name, slug: communities.slug }, event: events })
            .from(talkClaims)
            .innerJoin(communities, eq(communities.id, talkClaims.communityId))
            .leftJoin(events, eq(events.id, talkClaims.eventId))
            .where(
              and(
                inArray(
                  talkClaims.proposalId,
                  proposals.map((proposal) => proposal.id)
                ),
                inArray(talkClaims.status, ["claimed", "scheduled", "given"])
              )
            )
            .orderBy(desc(talkClaims.updatedAt))
        );

  return proposals.map((proposal): MyProposal => {
    const own = claims.filter((row) => row.claim.proposalId === proposal.id);
    // The live one first; otherwise the last time it was given
    const shown = own.find((row) => row.claim.status !== "given") ?? own[0];

    return {
      ...proposalView(proposal),
      communityIds: proposal.communityIds,
      notes: proposal.notes,
      status: proposal.status,
      claim: shown
        ? {
            status: shown.claim.status,
            community: shown.community,
            event: shown.event ? eventView(shown.event, shown.community.slug) : null,
          }
        : null,
    };
  });
});

const PROFILE_DEFAULTS: SpeakerProfile = {
  bio: "",
  topics: [],
  languages: ["es"],
  formats: [],
  links: {},
  mentor: false,
  public: false,
};

/** The caller's speaker profile (defaults until they save one). */
export const profile = Effect.gen(function* () {
  const me = yield* CurrentUser;
  const [row] = yield* query((db) => db.select().from(speakerProfiles).where(eq(speakerProfiles.userId, me.id)));

  return row
    ? ({
        bio: row.bio,
        topics: row.topics,
        languages: row.languages,
        formats: row.formats,
        links: row.links,
        mentor: row.mentor,
        public: row.public,
      } as SpeakerProfile)
    : PROFILE_DEFAULTS;
});

export const saveProfile = (input: SpeakerProfile) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    yield* query((db) =>
      db
        .insert(speakerProfiles)
        .values({ userId: me.id, ...input })
        .onConflictDoUpdate({ target: speakerProfiles.userId, set: input })
    );

    return input;
  });

/** A speaker's public page: only when they made it public, with their talks at published OWU events. */
export const speaker = (userId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({ profile: speakerProfiles, name: user.name })
        .from(speakerProfiles)
        .innerJoin(user, eq(user.id, speakerProfiles.userId))
        .where(and(eq(speakerProfiles.userId, userId), eq(speakerProfiles.public, true)))
    );
    if (!row) return yield* new NotFound({ entity: "speaker", message: "No hay una página pública con ese nombre" });
    const talks = yield* query((db) =>
      db
        .select({
          proposal: talkProposals,
          event: events,
          community: { name: communities.name, slug: communities.slug },
        })
        .from(talkClaims)
        .innerJoin(talkProposals, eq(talkProposals.id, talkClaims.proposalId))
        .innerJoin(events, eq(events.id, talkClaims.eventId))
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(
          and(
            eq(talkProposals.speakerUserId, userId),
            inArray(talkProposals.status, ["open", "withdrawn"]),
            inArray(talkClaims.status, ["scheduled", "given"]),
            eq(events.status, "published")
          )
        )
        .orderBy(desc(events.startDate))
    );
    const { profile: own } = row;
    const [latest] = yield* query((db) =>
      db
        .select({ name: talkProposals.speakerName })
        .from(talkProposals)
        .where(eq(talkProposals.speakerUserId, userId))
        .orderBy(desc(talkProposals.createdAt))
        .limit(1)
    );

    return {
      id: userId,
      name: latest?.name ?? row.name,
      bio: own.bio,
      topics: own.topics,
      languages: own.languages,
      formats: own.formats,
      links: own.links,
      mentor: own.mentor,
      talks: talks.map((talk) => ({
        title: talk.proposal.title,
        event: {
          name: talk.event.name,
          startDate: talk.event.startDate.toISOString(),
          url: eventPagePath(talk.community.slug, talk.event.slug),
        },
        community: talk.community,
      })),
    } as PublicSpeaker;
  });

// ---------------------------------------------------------------------------
// The panel: the inbox, claims, assigning to an event
// ---------------------------------------------------------------------------

/**
 * Open proposals this community may take: those that name it and the OWU-wide pool, newest first.
 * Not the ones it already holds (they're under «Tomadas») or gave.
 */
export const inbox = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const ours = yield* query((db) =>
    db
      .select({ proposalId: talkClaims.proposalId })
      .from(talkClaims)
      .where(
        and(eq(talkClaims.communityId, communityId), inArray(talkClaims.status, ["claimed", "scheduled", "given"]))
      )
  );
  const rows = yield* query((db) =>
    db
      .select({ proposal: talkProposals, live: { communityId: talkClaims.communityId, name: communities.name } })
      .from(talkProposals)
      .leftJoin(
        talkClaims,
        and(eq(talkClaims.proposalId, talkProposals.id), inArray(talkClaims.status, [...LIVE_CLAIM]))
      )
      .leftJoin(communities, eq(communities.id, talkClaims.communityId))
      .where(
        and(
          eq(talkProposals.status, "open"),
          or(
            sql`cardinality(${talkProposals.communityIds}) = 0`,
            sql`${talkProposals.communityIds} @> array[${communityId}]::text[]`
          ),
          ours.length > 0
            ? notInArray(
                talkProposals.id,
                ours.map((row) => row.proposalId)
              )
            : undefined
        )
      )
      .orderBy(desc(talkProposals.createdAt))
      // ponytail: no paging; the pool is tens of talks, add a cursor if it grows past this
      .limit(200)
  );
  const profiles = yield* profilesOf([...new Set(rows.map((row) => row.proposal.speakerUserId))]);

  return rows.map(({ proposal, live }): InboxProposal => {
    const state = claimState(
      live?.communityId ? { communityId: live.communityId, communityName: live.name ?? "" } : null,
      communityId
    );

    return {
      ...proposalView(proposal),
      forUs: proposal.communityIds.includes(communityId),
      takenBy: state.kind === "taken" ? state.by : null,
      speaker: speakerCard(profiles.get(proposal.speakerUserId)),
    };
  });
});

/** For Inicio: proposals that name this community and nobody took yet. */
export const talkInboxCount = (communityId: string) =>
  query((db) =>
    db
      .select({ count: count() })
      .from(talkProposals)
      .leftJoin(
        talkClaims,
        and(eq(talkClaims.proposalId, talkProposals.id), inArray(talkClaims.status, [...LIVE_CLAIM]))
      )
      .where(
        and(
          eq(talkProposals.status, "open"),
          sql`${talkProposals.communityIds} @> array[${communityId}]::text[]`,
          isNull(talkClaims.id)
        )
      )
  ).pipe(Effect.map(([row]) => row?.count ?? 0));

const claimer = alias(user, "claimer");
const speakerUser = alias(user, "speaker");

/** This community's claims (live and given), newest first; filtered by id when asked. */
const claimsOf = (communityId: string, claimId?: string) =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select({
          claim: talkClaims,
          proposal: talkProposals,
          speakerEmail: speakerUser.email,
          claimedBy: claimer.name,
          event: events,
          communitySlug: communities.slug,
        })
        .from(talkClaims)
        .innerJoin(talkProposals, eq(talkProposals.id, talkClaims.proposalId))
        .innerJoin(speakerUser, eq(speakerUser.id, talkProposals.speakerUserId))
        .innerJoin(communities, eq(communities.id, talkClaims.communityId))
        .leftJoin(claimer, eq(claimer.id, talkClaims.claimedById))
        .leftJoin(events, eq(events.id, talkClaims.eventId))
        .where(
          and(
            eq(talkClaims.communityId, communityId),
            inArray(talkClaims.status, ["claimed", "scheduled", "given"]),
            claimId ? eq(talkClaims.id, claimId) : undefined
          )
        )
        .orderBy(desc(talkClaims.createdAt))
        .limit(200)
    );
    const profiles = yield* profilesOf([...new Set(rows.map((row) => row.proposal.speakerUserId))]);

    return rows.map((row): Claim => ({
      ...proposalView(row.proposal),
      id: row.claim.id,
      proposalId: row.proposal.id,
      status: row.claim.status as Claim["status"],
      notes: row.proposal.notes,
      speakerEmail: row.speakerEmail,
      speaker: speakerCard(profiles.get(row.proposal.speakerUserId)),
      claimedBy: row.claimedBy,
      event: row.event ? eventView(row.event, row.communitySlug) : null,
    }));
  });

/** The talks this community took: claimed, on an event, or given. The speaker's email is here, to coordinate. */
export const claimedFor = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;

  return yield* claimsOf(communityId);
});

const oneClaim = (communityId: string, claimId: string) =>
  claimsOf(communityId, claimId).pipe(
    Effect.flatMap(([claim]) => (claim ? Effect.succeed(claim) : Effect.fail(claimNotFound)))
  );

/** "La queremos": take the talk. One live claim per talk; the speaker gets the organizer's contact. */
export const claim = (proposalId: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const me = yield* CurrentUser;
      // Locked: two communities taking it at once queue here, and the second sees the first's claim
      const [proposal] = yield* query((db) =>
        db.select().from(talkProposals).where(eq(talkProposals.id, proposalId)).for("update")
      );
      if (!proposal || !addressedTo(proposal, communityId)) return yield* proposalNotFound;
      const [live] = yield* query((db) =>
        db
          .select({ communityId: talkClaims.communityId, communityName: communities.name })
          .from(talkClaims)
          .innerJoin(communities, eq(communities.id, talkClaims.communityId))
          .where(and(eq(talkClaims.proposalId, proposalId), inArray(talkClaims.status, [...LIVE_CLAIM])))
      );
      const state = claimState(live ?? null, communityId);
      if (state.kind === "ours") return yield* new Conflict({ reason: "ours", message: "Ya la tomaron ustedes" });
      if (state.kind === "taken") {
        return yield* new Conflict({ reason: "taken", message: `La tomó ${state.by}`, occupiedBy: state.by });
      }

      const [created] = yield* query((db) =>
        db.insert(talkClaims).values({ proposalId, communityId, claimedById: me.id }).returning()
      );
      const [speakerRow, organizer, [community]] = yield* Effect.all([
        emailOf(proposal.speakerUserId),
        emailOf(me.id),
        query((db) => db.select({ name: communities.name }).from(communities).where(eq(communities.id, communityId))),
      ]);
      if (speakerRow && organizer) {
        yield* enqueueEmail({
          kind: "talk_claimed",
          to: speakerRow.email,
          priority: 4,
          // Per community: taking it again after «Deshacer» doesn't write twice
          dedupeKey: `talk_claimed:${proposalId}:${communityId}`,
          ...Mail.talkClaimedEmail({ title: proposal.title, community: community?.name ?? "Una comunidad", organizer }),
        });
      }

      return yield* oneClaim(communityId, created.id);
    })
  );

/** A live claim of this community, locked, with its proposal. */
const liveClaim = (claimId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [row] = yield* query((db) =>
      db
        .select({ claim: talkClaims, proposal: talkProposals })
        .from(talkClaims)
        .innerJoin(talkProposals, eq(talkProposals.id, talkClaims.proposalId))
        .where(and(eq(talkClaims.id, claimId), eq(talkClaims.communityId, communityId)))
        .for("update", { of: talkClaims })
    );
    if (!row || !(LIVE_CLAIM as readonly string[]).includes(row.claim.status)) return yield* claimNotFound;

    return { communityId, ...row };
  });

const talkOf = (proposal: TalkProposalRow) => ({ title: proposal.title, speaker: proposal.speakerName });

/** Take the talk out of an event's agenda (released, or moved to another event). */
const unschedule = (eventId: string, proposal: TalkProposalRow) =>
  Effect.gen(function* () {
    const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, eventId)).for("update"));
    if (!event) return;
    const talks = withoutTalk(event.talks, talkOf(proposal));
    if (talks.length === event.talks.length) return;
    yield* query((db) => db.update(events).set({ talks }).where(eq(events.id, eventId)));
    yield* refreshIfPublished(event);
  });

const refreshIfPublished = (event: Pick<EventRow, "status" | "communityId" | "slug">) =>
  Effect.gen(function* () {
    if (event.status !== "published") return;
    const [community] = yield* query((db) =>
      db.select({ slug: communities.slug }).from(communities).where(eq(communities.id, event.communityId))
    );
    if (community) refreshEvent(community.slug, event.slug);
  });

/** "Soltar": the talk goes back to the pool (and off its event). Undo takes it and assigns it again. */
export const release = (claimId: string) =>
  transaction(
    Effect.gen(function* () {
      const { claim: row, proposal } = yield* liveClaim(claimId);
      yield* query((db) => db.update(talkClaims).set({ status: "released" }).where(eq(talkClaims.id, row.id)));
      if (row.eventId && row.status === "scheduled") yield* unschedule(row.eventId, proposal);

      return { id: row.id, proposalId: proposal.id, eventId: row.status === "scheduled" ? row.eventId : null };
    })
  );

/**
 * "Asignar a un evento": the talk goes on one of this community's drafts or published events that
 * hasn't happened (in its talks, once), and the speaker hears the date and place. The event's
 * people aren't told: it's a detail of the page, not a change of date or place.
 */
export const assign = (claimId: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId, eventId } = yield* CommunityScope;
      if (!eventId) return yield* new Invalid({ message: "Elegí un evento" });
      const { claim: row, proposal } = yield* liveClaim(claimId);
      const [event] = yield* query((db) =>
        db
          .select()
          .from(events)
          .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
          .for("update")
      );
      if (!event || (event.status !== "draft" && event.status !== "published")) {
        return yield* new Invalid({ message: "Elegí un evento en borrador o publicado de esta comunidad" });
      }
      if (event.startDate.getTime() < Date.now()) {
        return yield* new Invalid({ message: "Ese evento ya pasó: elegí uno que venga" });
      }
      if (row.eventId && row.eventId !== eventId) yield* unschedule(row.eventId, proposal);

      const talks = withTalk(event.talks, talkOf(proposal));
      if (talks.length > 12) {
        return yield* new Conflict({
          reason: "full",
          message: "Ese evento ya tiene 12 charlas: sacá una desde el evento",
        });
      }
      if (talks.length !== event.talks.length) {
        yield* query((db) => db.update(events).set({ talks }).where(eq(events.id, eventId)));
        yield* refreshIfPublished(event);
      }
      yield* query((db) =>
        db.update(talkClaims).set({ status: "scheduled", eventId }).where(eq(talkClaims.id, row.id))
      );

      const [speakerRow, organizer, [community]] = yield* Effect.all([
        emailOf(proposal.speakerUserId),
        row.claimedById ? emailOf(row.claimedById) : Effect.succeed(null),
        query((db) =>
          db
            .select({ name: communities.name, slug: communities.slug })
            .from(communities)
            .where(eq(communities.id, communityId))
        ),
      ]);
      if (speakerRow) {
        const page = eventView(event, community?.slug ?? "").url;
        yield* enqueueEmail({
          kind: "talk_scheduled",
          to: speakerRow.email,
          priority: 4,
          dedupeKey: `talk_scheduled:${proposal.id}:${eventId}`,
          ...Mail.talkScheduledEmail({
            title: proposal.title,
            community: community?.name ?? "",
            event: event.name,
            when: shortWhen(event.startDate, event.timezone),
            place: placeOf(event),
            pageUrl: page ? appUrl(page) : null,
            organizer,
          }),
        });
      }

      return yield* oneClaim(communityId, row.id);
    })
  );

/** "Se dio": after the event, the talk counts as given (and shows on the speaker's public page). */
export const given = (claimId: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId, claim: row } = yield* liveClaim(claimId);
      const [event] = row.eventId
        ? yield* query((db) =>
            db
              .select({ startDate: events.startDate })
              .from(events)
              .where(eq(events.id, row.eventId ?? ""))
          )
        : [];
      if (row.status !== "scheduled" || !event || event.startDate.getTime() > Date.now()) {
        return yield* new Invalid({ message: "Marcala cuando haya pasado el evento al que la asignaron" });
      }
      yield* query((db) => db.update(talkClaims).set({ status: "given" }).where(eq(talkClaims.id, row.id)));

      return yield* oneClaim(communityId, row.id);
    })
  );

// ---------------------------------------------------------------------------
// Talk requests: "Buscamos charla sobre X"
// ---------------------------------------------------------------------------

const requestView = (row: {
  request: typeof talkRequests.$inferSelect;
  community: { id: string; name: string; slug: string };
}): TalkRequest => ({
  id: row.request.id,
  topic: row.request.topic,
  details: row.request.details,
  createdAt: row.request.createdAt.toISOString(),
  closedAt: row.request.closedAt?.toISOString() ?? null,
  community: row.community,
});

const requestColumns = {
  request: talkRequests,
  community: { id: communities.id, name: communities.name, slug: communities.slug },
};

/** Every community's open requests, for /dar-una-charla. */
export const openRequests = query((db) =>
  db
    .select(requestColumns)
    .from(talkRequests)
    .innerJoin(communities, eq(communities.id, talkRequests.communityId))
    .where(and(isNull(talkRequests.closedAt), eq(communities.isActive, true)))
    .orderBy(desc(talkRequests.createdAt))
    .limit(50)
).pipe(Effect.map((rows) => rows.map(requestView)));

/** This community's requests: open ones first, then the closed ones of the last months. */
export const requests = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const rows = yield* query((db) =>
    db
      .select(requestColumns)
      .from(talkRequests)
      .innerJoin(communities, eq(communities.id, talkRequests.communityId))
      .where(eq(talkRequests.communityId, communityId))
      .orderBy(sql`${talkRequests.closedAt} is not null`, desc(talkRequests.createdAt))
      .limit(50)
  );

  return rows.map(requestView);
});

export const createRequest = (input: { topic: string; details: string }) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const me = yield* CurrentUser;
    const [created] = yield* query((db) =>
      db
        .insert(talkRequests)
        .values({ communityId, topic: input.topic, details: input.details, createdById: me.id })
        .returning()
    );
    const [community] = yield* query((db) =>
      db.select(requestColumns.community).from(communities).where(eq(communities.id, communityId))
    );

    return requestView({ request: created, community: community ?? { id: communityId, name: "", slug: "" } });
  });

/** Close a request (it leaves /dar-una-charla), or open it again. */
export const setRequestClosed = (requestId: string, closed: boolean) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [updated] = yield* query((db) =>
      db
        .update(talkRequests)
        .set({ closedAt: closed ? new Date() : null })
        .where(and(eq(talkRequests.id, requestId), eq(talkRequests.communityId, communityId)))
        .returning()
    );
    if (!updated) return yield* new NotFound({ entity: "talk_request", message: "Ese pedido no existe" });
    const [community] = yield* query((db) =>
      db.select(requestColumns.community).from(communities).where(eq(communities.id, communityId))
    );

    return requestView({ request: updated, community: community ?? { id: communityId, name: "", slug: "" } });
  });

// ---------------------------------------------------------------------------
// Share cards
// ---------------------------------------------------------------------------

const chipsOf = (topics: string[]) => topics.map((topic) => `#${topicLabel(topic).toLowerCase().replace(/\s+/g, "-")}`);

/**
 * The words on an event's or a talk's share card, and whether anyone may see it (a published
 * event) or only the community's organizers (a draft). The route checks who's asking.
 */
export const card = (input: { kind: "evento" | "charla"; id: string }) =>
  Effect.gen(function* () {
    const notFound = new NotFound({ entity: "card", message: "No hay tarjeta para eso" });
    if (input.kind === "evento") {
      const [row] = yield* query((db) =>
        db
          .select({ event: events, community: communities.name })
          .from(events)
          .innerJoin(communities, eq(communities.id, events.communityId))
          .where(eq(events.id, input.id))
      );
      if (!row || row.event.status === "cancelled") return yield* notFound;
      const { event } = row;

      return {
        communityId: event.communityId,
        public: event.status === "published",
        tag: row.community,
        title: event.name,
        subtitle: shortWhen(event.startDate, event.timezone),
        footerLabel: "Dónde",
        footer: event.mode === "hibrido" ? `${placeOf(event)} y online` : placeOf(event),
        chips: chipsOf(event.topics),
      } satisfies Card;
    }

    const [row] = yield* query((db) =>
      db
        .select({ claim: talkClaims, proposal: talkProposals, event: events, community: communities.name })
        .from(talkClaims)
        .innerJoin(talkProposals, eq(talkProposals.id, talkClaims.proposalId))
        .innerJoin(events, eq(events.id, talkClaims.eventId))
        .innerJoin(communities, eq(communities.id, talkClaims.communityId))
        .where(and(eq(talkClaims.id, input.id), inArray(talkClaims.status, ["scheduled", "given"])))
    );
    if (!row || row.proposal.status === "archived" || row.event.status === "cancelled") return yield* notFound;

    return {
      communityId: row.claim.communityId,
      public: row.event.status === "published",
      tag: row.community,
      title: row.proposal.title,
      subtitle: `${shortWhen(row.event.startDate, row.event.timezone)} · ${row.event.name}`,
      footerLabel: "Charla de",
      footer: row.proposal.speakerName,
      chips: chipsOf(row.proposal.topics),
    } satisfies Card;
  });

// ---------------------------------------------------------------------------
// Speaker emails and the materials link
// ---------------------------------------------------------------------------

/** The materials link's token: for one claim on one event, so a talk moved to another event needs a new one. */
const materialsToken = (claimId: string, eventId: string) =>
  Effect.promise(() =>
    signLink("talk-materials", `${claimId}.${eventId}`, new Date(Date.now() + MATERIALS_DAYS * DAY))
  );

const fromToken = (token: string) =>
  Effect.gen(function* () {
    const id = yield* Effect.promise(() => readLink("talk-materials", token));
    const [claimId, eventId] = id?.split(".") ?? [];
    if (!claimId || !eventId) return yield* linkNotFound;
    const [row] = yield* query((db) =>
      db
        .select({ claim: talkClaims, proposal: talkProposals, event: events, communitySlug: communities.slug })
        .from(talkClaims)
        .innerJoin(talkProposals, eq(talkProposals.id, talkClaims.proposalId))
        .innerJoin(events, eq(events.id, eventId))
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(eq(talkClaims.id, claimId))
    );
    // A talk moved to another event (or released) since the email: this link isn't for it anymore
    if (!row || row.claim.eventId !== eventId || !["scheduled", "given"].includes(row.claim.status)) {
      return yield* linkNotFound;
    }

    return row;
  });

/** What the materials page shows. Reading it changes nothing. */
export const materialsView = (token: string) =>
  Effect.gen(function* () {
    const row = yield* fromToken(token);

    return {
      title: row.proposal.title,
      speakerName: row.proposal.speakerName,
      event: {
        name: row.event.name,
        startDate: row.event.startDate.toISOString(),
        url: eventView(row.event, row.communitySlug).url,
      },
      sent: row.claim.materialsAt !== null,
    };
  });

/** The speaker's slides and recording, from the emailed link (once): they go to the event's Materiales. */
export const submitMaterials = (input: { token: string; slides?: string; recording?: string }) =>
  transaction(
    Effect.gen(function* () {
      const row = yield* fromToken(input.token);
      const [spent] = yield* query((db) =>
        db
          .update(talkClaims)
          .set({ materialsAt: new Date() })
          .where(and(eq(talkClaims.id, row.claim.id), isNull(talkClaims.materialsAt)))
          .returning({ id: talkClaims.id })
      );
      if (!spent) {
        return yield* new Conflict({
          reason: "used",
          message: "Ya mandaste los materiales con este link. Si falta algo, escribile a quien organiza.",
        });
      }
      const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, row.event.id)).for("update"));
      if (!event) return yield* linkNotFound;
      const title = row.proposal.title.slice(0, 100);
      const added = [
        ...(input.slides ? [{ kind: "slides" as const, title: `Slides · ${title}`, url: input.slides }] : []),
        ...(input.recording
          ? [{ kind: "grabacion" as const, title: `Grabación · ${title}`, url: input.recording }]
          : []),
      ].filter((item) => !event.materials.some((material) => material.url === item.url));
      if (event.materials.length + added.length > 10) {
        return yield* new Conflict({
          reason: "full",
          message: "El evento ya tiene 10 materiales: mandale los links a quien organiza.",
        });
      }
      yield* query((db) =>
        db
          .update(events)
          .set({ materials: [...event.materials, ...added] })
          .where(eq(events.id, event.id))
      );
      yield* refreshIfPublished(event);

      return { added: added.length };
    })
  );

/**
 * The speaker emails, per talk on a published event: T−14 d confirmation with the info pack,
 * T−2 d slides, T+1 d thanks with the materials link. Each is deduped per talk, event and kind, so
 * running this twice (or at once) sends each one once.
 */
export const sendSpeakerEmails = Effect.gen(function* () {
  const now = Date.now();
  const rows = yield* query((db) =>
    db
      .select({
        claim: talkClaims,
        proposal: talkProposals,
        event: events,
        speakerEmail: speakerUser.email,
        organizer: { name: claimer.name, email: claimer.email },
        community: communities.name,
        communitySlug: communities.slug,
      })
      .from(talkClaims)
      .innerJoin(talkProposals, eq(talkProposals.id, talkClaims.proposalId))
      .innerJoin(speakerUser, eq(speakerUser.id, talkProposals.speakerUserId))
      .innerJoin(events, eq(events.id, talkClaims.eventId))
      .innerJoin(communities, eq(communities.id, talkClaims.communityId))
      .leftJoin(claimer, eq(claimer.id, talkClaims.claimedById))
      .where(
        and(
          inArray(talkClaims.status, ["scheduled", "given"]),
          eq(talkProposals.status, "open"),
          eq(events.status, "published"),
          lt(events.startDate, new Date(now + 14 * DAY)),
          gt(events.endDate, new Date(now - 8 * DAY))
        )
      )
      .orderBy(asc(events.startDate))
  );
  const due = rows.flatMap((row) => {
    const kind = speakerEmailDue(row.event, now);
    // Thanks only for a talk that happened: a given one, or one still on the event
    if (!kind || (kind !== "t1" && row.claim.status !== "scheduled")) return [];

    return [{ row, kind, key: `talk_${kind}:${row.proposal.id}:${row.event.id}` }];
  });
  const done = new Set(
    due.length === 0
      ? []
      : (yield* query((db) =>
          db
            .select({ key: emailDeliveries.dedupeKey })
            .from(emailDeliveries)
            .where(
              inArray(
                emailDeliveries.dedupeKey,
                due.map((item) => item.key)
              )
            )
        )).map((item) => item.key)
  );

  let sent = 0;
  for (const { row, kind, key } of due.filter((item) => !done.has(item.key))) {
    const { proposal, event } = row;
    const when = shortWhen(event.startDate, event.timezone);
    const pageUrl = appUrl(eventPagePath(row.communitySlug, event.slug));
    const organizer = row.organizer?.email ? { name: row.organizer.name ?? "", email: row.organizer.email } : null;
    const mail =
      kind === "t14"
        ? Mail.speakerConfirmEmail({
            title: proposal.title,
            event: event.name,
            when,
            place: placeOf(event),
            pageUrl,
            recordingOk: proposal.recordingOk,
            organizer,
          })
        : kind === "t2"
          ? Mail.speakerSoonEmail({ title: proposal.title, event: event.name, when, place: placeOf(event), organizer })
          : Mail.speakerThanksEmail({
              title: proposal.title,
              event: event.name,
              community: row.community,
              link: appUrl(`/charlas/materiales/${yield* materialsToken(row.claim.id, event.id)}`),
            });
    yield* enqueueEmail({ kind: `talk_${kind}`, to: row.speakerEmail, priority: 5, dedupeKey: key, ...mail });
    sent += 1;
  }

  return { speakers: sent };
});
