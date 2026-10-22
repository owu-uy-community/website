import { describe, expect, test } from "vitest";

import type { Community } from "./content";
import { isUpcoming, mergeEvents, nextEventByCommunity, type OwnEvent } from "./events";
import { dateParts, montevideoIso } from "./time";

const community = (slug: string, name: string, feedNames: string[] = []): Community => ({
  slug,
  name,
  logo: null,
  description: "",
  topics: [],
  status: "activa",
  website: null,
  linkedin: null,
  instagram: null,
  meetup: null,
  slackChannel: null,
  feedNames,
  confPartner: false,
  reviewedAt: null,
});

const communities = [
  community("owasp-uruguay", "OWASP Uruguay", ["OWASP Uruguay Chapter"]),
  community("gdg-montevideo", "GDG Montevideo"),
];

const feed = [
  {
    id: 264,
    name: "OWU Conf 2026",
    title: "OWU Conf 2026",
    datetime: "2026-11-07T14:30:00",
    end_datetime: "2026-11-07T20:30:00",
    event_url: "https://example.com/conf",
    venue: "Sinergia Faro",
  },
  {
    id: 259,
    name: "OWASP Uruguay Chapter",
    title: "OWASP Meetup - Octubre",
    datetime: "2026-10-26T18:30:00",
    end_datetime: "2026-10-26T21:30:00",
    event_url: "https://example.com/owasp",
    venue: null,
  },
];

const manual = [
  {
    slug: "devfest",
    title: "DevFest",
    communitySlug: "gdg-montevideo",
    organizer: null,
    start: "2026-11-01T10:00",
    end: null,
    venue: "LATU",
    url: "https://example.com/devfest",
  },
];

describe(montevideoIso, () => {
  test("adds the fixed UTC-3 offset to wall-clock times", () => {
    expect(montevideoIso("2026-10-22T19:00:00")).toBe("2026-10-22T19:00:00-03:00");
    expect(montevideoIso("2026-11-01T10:00")).toBe("2026-11-01T10:00:00-03:00");
    expect(montevideoIso("2026-11-01T10:00:00Z")).toBe("2026-11-01T10:00:00Z");
  });

  test("formats in Montevideo whatever the server timezone", () => {
    expect(dateParts("2026-10-22T22:30:00Z")).toMatchObject({ day: "22", time: "19:30" });
  });
});

describe(mergeEvents, () => {
  const merged = mergeEvents(feed, manual, communities);

  test("sorts both sources by start and links them to the directory", () => {
    expect(merged.map((event) => event.id)).toStrictEqual(["meetup-259", "manual-devfest", "meetup-264"]);
    expect(merged[0]).toMatchObject({ group: "OWASP Uruguay", communitySlug: "owasp-uruguay", venue: null });
    expect(merged[1]).toMatchObject({ group: "GDG Montevideo", source: "manual" });
  });

  test("flags OWU's own events by exact name only", () => {
    expect(merged.find((event) => event.id === "meetup-264")?.isOwu).toBe(true);
    expect(merged.find((event) => event.id === "meetup-259")?.isOwu).toBe(false);
    const impostor = mergeEvents([{ ...feed[0], id: 1, name: "OWU Oficial Fans" }], [], communities);
    expect(impostor[0].isOwu).toBe(false);
  });

  test("drops hand-added events whose link is not a web page", () => {
    // The point of this test: a script URL must never reach the agenda
    // oxlint-disable-next-line no-script-url
    expect(mergeEvents([], [{ ...manual[0], url: "javascript:alert(1)" }], communities)).toStrictEqual([]);
  });

  test("keeps an event until it ends", () => {
    const owasp = merged[0];
    expect(isUpcoming(owasp, Date.parse("2026-10-26T21:00:00-03:00"))).toBe(true);
    expect(isUpcoming(owasp, Date.parse("2026-10-26T21:31:00-03:00"))).toBe(false);
  });

  test("an event made in OWU replaces its copy on Meetup, by link or by community and time", () => {
    const own = (overrides: Partial<OwnEvent>): OwnEvent => ({
      id: "e1",
      name: "OWASP en OWU",
      slug: "owasp-en-owu",
      start: "2026-10-26T21:45:00.000Z",
      end: "2026-10-27T00:30:00.000Z",
      communitySlug: "owasp-uruguay",
      communityName: "OWASP Uruguay",
      place: "Sala",
      meetupUrl: null,
      ...overrides,
    });
    const byTime = mergeEvents(feed, [], communities, [own({})]);
    const byLink = mergeEvents(feed, [], communities, [
      own({ start: "2026-12-01T22:00:00.000Z", meetupUrl: "https://www.example.com/owasp/" }),
    ]);
    const someoneElses = mergeEvents(feed, [], communities, [
      own({ communitySlug: "otra", start: "2026-12-01T22:00:00.000Z", meetupUrl: "https://example.com/owasp" }),
    ]);

    expect(byTime.map((event) => event.id)).toStrictEqual(["owu-e1", "meetup-264"]);
    expect(byTime[0]).toMatchObject({ source: "owu", url: "/comunidad/owasp-uruguay/events/owasp-en-owu" });
    expect(byLink.map((event) => event.id)).toStrictEqual(["meetup-264", "owu-e1"]);
    expect(someoneElses.map((event) => event.id)).toContain("meetup-259");
  });

  test("picks each community's next event", () => {
    expect(nextEventByCommunity(merged).get("gdg-montevideo")?.id).toBe("manual-devfest");
  });
});
