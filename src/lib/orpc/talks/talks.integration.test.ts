import { call } from "@orpc/server";
import { and, eq, like } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries, events, talkClaims } from "lib/db/schema";
import { signLink } from "lib/links";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeSiteAdmin, makeUser, type UserRow } from "test/factories";

import type { ProposalFields } from "./schemas";
import { sendSpeakerEmails, talkInboxCount } from "./service";

const DAY = 86_400_000;
const run = Effect.runPromiseWith(liveServices);

const fields = (overrides: Partial<ProposalFields> = {}): ProposalFields => ({
  speakerName: "Ana Oradora",
  title: "Testing sin dolor",
  abstract: "Cómo escribir tests que no se rompen cada vez que alguien cambia un botón de lugar.",
  format: "corta",
  level: "inicial",
  topics: ["testing"],
  language: "es",
  firstTime: true,
  recordingOk: true,
  communityIds: [],
  notes: "",
  ...overrides,
});

const propose = (speaker: UserRow, overrides: Partial<ProposalFields> = {}) =>
  call(router.talks.propose, fields(overrides), by(speaker));

const mail = (to: string, kind: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, kind)));

const talksOf = async (eventId: string) =>
  (await db.select({ talks: events.talks }).from(events).where(eq(events.id, eventId)))[0]?.talks;

/** The error code a call fails with, or "ok": several refusals in one assertion. */
const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (error: { code?: string }) => error.code ?? "error"
  );

/** Two communities with an editor each, and a speaker. */
async function setup() {
  const [python, data] = await Promise.all([
    makeCommunity({ name: "Python de prueba" }),
    makeCommunity({ name: "Datos de prueba" }),
  ]);
  const [pythonEditor, dataEditor, speaker] = await Promise.all([
    makeMember(python.id, "editor", { name: "Editora Python" }),
    makeMember(data.id, "editor", { name: "Editor Datos" }),
    makeUser({ name: "Ana Oradora" }),
  ]);

  return { python, data, pythonEditor, dataEditor, speaker };
}

const upcoming = (communityId: string, days: number, overrides: Parameters<typeof makeEvent>[1] = {}) => {
  const startDate = new Date(Date.now() + days * DAY);

  return makeEvent(communityId, {
    name: `Meetup en ${days} días`,
    status: "published",
    startDate,
    endDate: new Date(startDate.getTime() + 2 * 3_600_000),
    placeName: "Sinergia",
    ...overrides,
  });
};

describe("proposing", () => {
  test("needs a sign-in; the editors of each named community hear once; the pool tells nobody", async () => {
    const { python, data, pythonEditor, dataEditor, speaker } = await setup();

    await expect(call(router.talks.propose, fields(), by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const named = await propose(speaker, { communityIds: [python.id] });
    await propose(speaker, { title: "Para cualquiera de OWU" });
    // Editing it to add a community tells the new one, not the first again
    await call(
      router.talks.update,
      { ...fields({ communityIds: [python.id, data.id] }), proposalId: named.id },
      by(speaker)
    );

    await expect(mail(pythonEditor.email, "talk_proposed")).resolves.toHaveLength(1);
    await expect(mail(dataEditor.email, "talk_proposed")).resolves.toHaveLength(1);
    const mine = await call(router.talks.mine, undefined, by(speaker));
    expect(mine.map((proposal) => [proposal.title, proposal.communityIds.length, proposal.status])).toStrictEqual([
      ["Para cualquiera de OWU", 0, "open"],
      ["Testing sin dolor", 2, "open"],
    ]);
  });

  test("editing the communities again and again tells at most eight of them in all", async () => {
    const speaker = await makeUser();
    const named = await Promise.all(
      Array.from({ length: 12 }, (_, index) => makeCommunity({ name: `Comunidad ${index}` }))
    );
    await Promise.all(named.map((community) => makeMember(community.id, "editor")));
    const { id } = await propose(speaker, { communityIds: named.slice(0, 4).map((community) => community.id) });

    for (const slice of [
      [4, 8],
      [8, 12],
    ]) {
      await call(
        router.talks.update,
        { ...fields({ communityIds: named.slice(...slice).map((community) => community.id) }), proposalId: id },
        by(speaker)
      );
    }
    const told = await db
      .selectDistinct({ key: emailDeliveries.dedupeKey })
      .from(emailDeliveries)
      .where(like(emailDeliveries.dedupeKey, `talk_proposed:${id}:%`));
    expect(new Set(told.map(({ key }) => key.split(":")[2])).size).toBe(8);
  });

  test("five a day per person", async () => {
    const speaker = await makeUser();
    for (let index = 0; index < 5; index++) await propose(speaker, { title: `Charla número ${index}` });

    await expect(propose(speaker, { title: "Una de más" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  test("names only communities in OWU, and someone else's proposal can't be edited or withdrawn", async () => {
    const { python, speaker } = await setup();
    const other = await makeUser();

    await expect(propose(speaker, { communityIds: ["no-existe"] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(propose(speaker, { topics: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { id } = await propose(speaker, { communityIds: [python.id] });
    await expect(
      call(router.talks.update, { ...fields({ title: "Robada" }), proposalId: id }, by(other))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call(router.talks.withdraw, { proposalId: id }, by(other))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("the inbox", () => {
  test("a community sees what names it and the OWU pool, never what names only another", async () => {
    const { python, data, pythonEditor, dataEditor, speaker } = await setup();
    const forPython = await propose(speaker, { title: "Solo para Python", communityIds: [python.id] });
    const forData = await propose(speaker, { title: "Solo para Datos", communityIds: [data.id] });
    const pool = await propose(speaker, { title: "Para cualquiera" });

    const seen = await call(router.talks.inbox, { communityId: python.id }, by(pythonEditor));
    const ids = seen.map((proposal) => proposal.id);
    expect([ids.includes(forPython.id), ids.includes(pool.id), ids.includes(forData.id)]).toStrictEqual([
      true,
      true,
      false,
    ]);
    expect(seen.find((proposal) => proposal.id === forPython.id)).toMatchObject({ forUs: true, takenBy: null });
    // No email in the inbox: only a community that took the talk sees it
    expect(JSON.stringify(seen)).not.toContain(speaker.email);
    await expect(call(router.talks.inbox, { communityId: python.id }, by(dataEditor))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(run(talkInboxCount(python.id))).resolves.toBe(1);
  });

  test("a member without talk:read can't see it", async () => {
    const { python } = await setup();
    const member = await makeMember(python.id, "member");

    await expect(call(router.talks.inbox, { communityId: python.id }, by(member))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("claims", () => {
  test("two communities take the same talk at once: one wins, the other sees who has it", async () => {
    const { python, data, pythonEditor, dataEditor, speaker } = await setup();
    const { id } = await propose(speaker);

    const results = await Promise.allSettled([
      call(router.talks.claim, { communityId: python.id, proposalId: id }, by(pythonEditor)),
      call(router.talks.claim, { communityId: data.id, proposalId: id }, by(dataEditor)),
    ]);
    expect(results.map((result) => result.status).toSorted()).toStrictEqual(["fulfilled", "rejected"]);
    const lost = results.find((result) => result.status === "rejected");
    expect(lost?.reason).toMatchObject({ code: "CONFLICT", message: expect.stringMatching(/^La tomó /) });
    await expect(db.select().from(talkClaims).where(eq(talkClaims.proposalId, id))).resolves.toHaveLength(1);
  });

  test("the claim tells the speaker who to write to; the email is only for the community that took it", async () => {
    const { python, data, pythonEditor, dataEditor, speaker } = await setup();
    const { id } = await propose(speaker);

    const claim = await call(router.talks.claim, { communityId: python.id, proposalId: id }, by(pythonEditor));
    expect(claim).toMatchObject({ status: "claimed", speakerEmail: speaker.email, claimedBy: "Editora Python" });
    const [told] = await mail(speaker.email, "talk_claimed");
    expect(told.text).toContain(pythonEditor.email);

    const other = await call(router.talks.inbox, { communityId: data.id }, by(dataEditor));
    expect(other.find((proposal) => proposal.id === id)).toMatchObject({ takenBy: "Python de prueba" });
    await expect(
      call(router.talks.claim, { communityId: data.id, proposalId: id }, by(dataEditor))
    ).rejects.toMatchObject({ code: "CONFLICT", message: "La tomó Python de prueba" });
    // Nothing of it in the other community's claims, and it can't let it go either
    expect([
      (await call(router.talks.claimedFor, { communityId: data.id }, by(dataEditor))).length,
      await outcome(call(router.talks.release, { communityId: data.id, claimId: claim.id }, by(dataEditor))),
    ]).toStrictEqual([0, "NOT_FOUND"]);
  });

  test("a talk named to one community can't be taken by another", async () => {
    const { python, data, dataEditor, speaker } = await setup();
    const { id } = await propose(speaker, { communityIds: [python.id] });

    await expect(
      call(router.talks.claim, { communityId: data.id, proposalId: id }, by(dataEditor))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("released, it's free again; taken again, the speaker isn't written twice", async () => {
    const { python, data, pythonEditor, dataEditor, speaker } = await setup();
    const { id } = await propose(speaker);
    const first = await call(router.talks.claim, { communityId: python.id, proposalId: id }, by(pythonEditor));

    await call(router.talks.release, { communityId: python.id, claimId: first.id }, by(pythonEditor));
    await call(router.talks.claim, { communityId: python.id, proposalId: id }, by(pythonEditor));
    await expect(mail(speaker.email, "talk_claimed")).resolves.toHaveLength(1);
    const [again] = await call(router.talks.claimedFor, { communityId: python.id }, by(pythonEditor));
    await call(router.talks.release, { communityId: python.id, claimId: again.id }, by(pythonEditor));

    await expect(
      call(router.talks.claim, { communityId: data.id, proposalId: id }, by(dataEditor))
    ).resolves.toMatchObject({ status: "claimed" });
  });

  test("assigning puts it on a coming event of the community, once, and tells the speaker the date", async () => {
    const { python, data, pythonEditor, speaker } = await setup();
    const { id } = await propose(speaker);
    const claim = await call(router.talks.claim, { communityId: python.id, proposalId: id }, by(pythonEditor));
    const event = await upcoming(python.id, 20, { talks: [{ title: "Otra charla", speaker: "Beto" }] });
    const elsewhere = await upcoming(data.id, 20);
    const past = await upcoming(python.id, -3);
    const assign = (eventId: string) =>
      call(router.talks.assign, { communityId: python.id, claimId: claim.id, eventId }, by(pythonEditor));

    expect([await outcome(assign(elsewhere.id)), await outcome(assign(past.id))]).toStrictEqual([
      "NOT_FOUND",
      "BAD_REQUEST",
    ]);
    await expect(assign(event.id)).resolves.toMatchObject({ status: "scheduled", event: { id: event.id } });
    await assign(event.id);

    await expect(talksOf(event.id)).resolves.toStrictEqual([
      { title: "Otra charla", speaker: "Beto" },
      { title: "Testing sin dolor", speaker: "Ana Oradora" },
    ]);
    await expect(mail(speaker.email, "talk_scheduled")).resolves.toMatchObject([
      { text: expect.stringContaining("Sinergia") },
    ]);
  });

  test("moved to another event or released, it leaves the first one's agenda", async () => {
    const { python, pythonEditor, speaker } = await setup();
    const { id } = await propose(speaker);
    const claim = await call(router.talks.claim, { communityId: python.id, proposalId: id }, by(pythonEditor));
    const event = await upcoming(python.id, 20);
    const draft = await upcoming(python.id, 40, { status: "draft" });
    const assign = (eventId: string) =>
      call(router.talks.assign, { communityId: python.id, claimId: claim.id, eventId }, by(pythonEditor));

    await assign(event.id);
    await assign(draft.id);
    expect([await talksOf(event.id), await talksOf(draft.id)]).toStrictEqual([
      [],
      [{ title: "Testing sin dolor", speaker: "Ana Oradora" }],
    ]);
    const released = await call(router.talks.release, { communityId: python.id, claimId: claim.id }, by(pythonEditor));
    expect(released).toStrictEqual({ id: claim.id, proposalId: id, eventId: draft.id });
    await expect(talksOf(draft.id)).resolves.toStrictEqual([]);
  });

  test("«Se dio» only after its event", async () => {
    const { python, pythonEditor, speaker } = await setup();
    const { id } = await propose(speaker);
    const claim = await call(router.talks.claim, { communityId: python.id, proposalId: id }, by(pythonEditor));
    const given = () => call(router.talks.given, { communityId: python.id, claimId: claim.id }, by(pythonEditor));

    await expect(given()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const event = await upcoming(python.id, 5);
    await call(router.talks.assign, { communityId: python.id, claimId: claim.id, eventId: event.id }, by(pythonEditor));
    await expect(given()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await db
      .update(events)
      .set({ startDate: new Date(Date.now() - DAY) })
      .where(eq(events.id, event.id));
    await expect(given()).resolves.toMatchObject({ status: "given" });
  });

  test("withdrawing lets the claim go and tells whoever took it; staff archive spam", async () => {
    const { python, pythonEditor, speaker } = await setup();
    const staff = await makeSiteAdmin();
    const { id } = await propose(speaker);
    const claim = await call(router.talks.claim, { communityId: python.id, proposalId: id }, by(pythonEditor));
    const event = await upcoming(python.id, 10);
    await call(router.talks.assign, { communityId: python.id, claimId: claim.id, eventId: event.id }, by(pythonEditor));

    await call(router.talks.withdraw, { proposalId: id }, by(speaker));
    expect([
      await call(router.talks.claimedFor, { communityId: python.id }, by(pythonEditor)),
      // Off the event's agenda too
      await talksOf(event.id),
    ]).toStrictEqual([[], []]);
    await expect(mail(pythonEditor.email, "talk_withdrawn")).resolves.toHaveLength(1);

    const spam = await propose(speaker, { title: "Comprá cripto ya" });
    await expect(call(router.talks.archive, { proposalId: spam.id }, by(pythonEditor))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await call(router.talks.archive, { proposalId: spam.id }, by(staff));
    const seen = await call(router.talks.inbox, { communityId: python.id }, by(pythonEditor));
    expect(seen.map((proposal) => proposal.id)).not.toContain(spam.id);
  });
});

describe("talk requests", () => {
  test("a community asks; it shows on /dar-una-charla until closed; another community can't touch it", async () => {
    const { python, data, pythonEditor, dataEditor } = await setup();

    const request = await call(
      router.talks.requests.create,
      { communityId: python.id, topic: "Django en producción", details: "Para noviembre" },
      by(pythonEditor)
    );
    expect((await call(router.talks.requests.open, undefined, by(null))).map((row) => row.id)).toContain(request.id);
    await expect(call(router.talks.requests.list, { communityId: data.id }, by(dataEditor))).resolves.toStrictEqual([]);
    await expect(
      call(
        router.talks.requests.setClosed,
        { communityId: data.id, requestId: request.id, closed: true },
        by(dataEditor)
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await call(
      router.talks.requests.setClosed,
      { communityId: python.id, requestId: request.id, closed: true },
      by(pythonEditor)
    );
    expect((await call(router.talks.requests.open, undefined, by(null))).map((row) => row.id)).not.toContain(
      request.id
    );
    const [listed] = await call(router.talks.requests.list, { communityId: python.id }, by(pythonEditor));
    expect(listed).toMatchObject({ id: request.id, closedAt: expect.any(String) });
  });
});

/** A talk scheduled on an event `days` from now (negative: it already happened). */
async function scheduledTalk(days: number, overrides: Partial<ProposalFields> = {}) {
  const { python, pythonEditor, speaker } = await setup();
  const { id } = await propose(speaker, overrides);
  const claim = await call(router.talks.claim, { communityId: python.id, proposalId: id }, by(pythonEditor));
  const event = await upcoming(python.id, days);
  await db.update(talkClaims).set({ status: "scheduled", eventId: event.id }).where(eq(talkClaims.id, claim.id));

  return { python, pythonEditor, speaker, claim, event };
}

describe("speaker emails", () => {
  test("two weeks before, two days before and the day after: each once, across two ticks", async () => {
    const twoWeeks = await scheduledTalk(10);
    const twoDays = await scheduledTalk(1);
    const after = await scheduledTalk(-1.5);
    const later = await scheduledTalk(30);

    await run(sendSpeakerEmails);
    await run(sendSpeakerEmails);

    await expect(mail(twoWeeks.speaker.email, "talk_t14")).resolves.toMatchObject([
      { text: expect.stringMatching(/16:9[\s\S]*\/codigo-de-conducta/) },
    ]);
    await expect(mail(twoDays.speaker.email, "talk_t2")).resolves.toHaveLength(1);
    await expect(mail(after.speaker.email, "talk_t1")).resolves.toMatchObject([
      { text: expect.stringContaining("/charlas/materiales/") },
    ]);
    await expect(
      db
        .select()
        .from(emailDeliveries)
        .where(like(emailDeliveries.dedupeKey, `talk_%:%:${later.event.id}`))
    ).resolves.toStrictEqual([]);
  });
});

describe("the materials link", () => {
  test("signed, once, for its event; reading the page changes nothing", async () => {
    const { claim, event, speaker } = await scheduledTalk(-1.5);
    await run(sendSpeakerEmails);
    const [thanks] = await mail(speaker.email, "talk_t1");
    const token = /materiales\/(\S+)/.exec(thanks.text)?.[1] ?? "";

    const view = await call(router.talks.materials.view, { token }, by(null));
    await call(router.talks.materials.view, { token }, by(null));
    expect(view).toMatchObject({ title: "Testing sin dolor", sent: false, event: { name: event.name } });
    const materialsOf = async () =>
      (await db.select({ materials: events.materials }).from(events).where(eq(events.id, event.id)))[0]?.materials;
    await expect(materialsOf()).resolves.toStrictEqual([]);

    const expired = await signLink("talk-materials", `${claim.id}.${event.id}`, new Date(Date.now() - 60_000));
    const elsewhere = await signLink("talk-materials", `${claim.id}.otro-evento`, new Date(Date.now() + DAY));
    const submit = (input: { token: string; slides?: string; recording?: string }) =>
      outcome(call(router.talks.materials.submit, input, by(null)));
    expect([
      await submit({ token: expired, slides: "https://example.com/slides" }),
      await submit({ token: elsewhere, slides: "https://example.com/slides" }),
      await submit({ token: `${token}x`, slides: "https://example.com/slides" }),
      await submit({ token, slides: "http://example.com/slides" }),
      await submit({ token, slides: "https://example.com/slides", recording: "https://example.com/video" }),
      // Once: the same link again is refused
      await submit({ token, slides: "https://example.com/otra" }),
    ]).toStrictEqual(["NOT_FOUND", "NOT_FOUND", "NOT_FOUND", "BAD_REQUEST", "ok", "CONFLICT"]);

    await expect(materialsOf()).resolves.toStrictEqual([
      { kind: "slides", title: "Slides · Testing sin dolor", url: "https://example.com/slides" },
      { kind: "grabacion", title: "Grabación · Testing sin dolor", url: "https://example.com/video" },
    ]);
    await expect(call(router.talks.materials.view, { token }, by(null))).resolves.toMatchObject({ sent: true });
  });
});

describe("speaker profiles", () => {
  test("the public page exists only once they open it, with their talks at published events", async () => {
    const { speaker, python, pythonEditor } = await scheduledTalk(5);
    const profile = {
      bio: "Hago testing hace diez años.",
      topics: ["testing" as const],
      languages: ["es" as const],
      formats: ["corta" as const],
      links: { github: "https://github.com/ejemplo" },
      mentor: true,
      public: false,
    };

    await call(router.talks.saveProfile, profile, by(speaker));
    await expect(call(router.talks.speaker, { userId: speaker.id }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Organizers they proposed to see it anyway
    const [claim] = await call(router.talks.claimedFor, { communityId: python.id }, by(pythonEditor));
    expect(claim.speaker).toMatchObject({ bio: "Hago testing hace diez años.", mentor: true, url: null });

    await call(router.talks.saveProfile, { ...profile, public: true }, by(speaker));
    await expect(call(router.talks.profile, undefined, by(speaker))).resolves.toStrictEqual({
      ...profile,
      public: true,
    });
    const page = await call(router.talks.speaker, { userId: speaker.id }, by(null));
    expect(page).toMatchObject({ name: "Ana Oradora", mentor: true });
    expect(page.talks.map((talk) => talk.title)).toStrictEqual(["Testing sin dolor"]);
  });
});

describe("share cards", () => {
  test("a published event's card is anyone's; a draft's only its organizers'", async () => {
    const { python, pythonEditor, dataEditor } = await setup();
    const published = await upcoming(python.id, 7, { name: "Meetup publicado" });
    const draft = await upcoming(python.id, 30, { status: "draft", name: "Borrador" });

    await expect(call(router.talks.card, { kind: "evento", id: published.id }, by(null))).resolves.toMatchObject({
      public: true,
      tag: "Python de prueba",
      title: "Meetup publicado",
      footer: "Sinergia",
    });
    await expect(call(router.talks.card, { kind: "evento", id: draft.id }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(call(router.talks.card, { kind: "evento", id: draft.id }, by(dataEditor))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(call(router.talks.card, { kind: "evento", id: draft.id }, by(pythonEditor))).resolves.toMatchObject({
      public: false,
    });
  });

  test("a talk's card needs it on an event", async () => {
    const { claim } = await scheduledTalk(7);

    await expect(call(router.talks.card, { kind: "charla", id: claim.id }, by(null))).resolves.toMatchObject({
      title: "Testing sin dolor",
      footerLabel: "Charla de",
      footer: "Ana Oradora",
    });
    await db.update(talkClaims).set({ status: "claimed", eventId: null }).where(eq(talkClaims.id, claim.id));
    await expect(call(router.talks.card, { kind: "charla", id: claim.id }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
