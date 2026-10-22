import { describe, expect, test } from "vitest";

import { buildIcs, buildInvite } from "./ics";

const event = {
  id: "meetup-260",
  title: "Ruby Montevideo Meetup, Octubre; 2026",
  start: "2026-10-22T19:00:00-03:00",
  end: null,
  location: "Effectus Software",
  url: "https://www.meetup.com/ruby-montevideo/events/316855290/",
  description: "Organiza: Ruby Montevideo\nMás info en el link",
};

describe(buildIcs, () => {
  const ics = buildIcs([event], {
    name: "OWU · Eventos",
    description: "Eventos tech en Uruguay",
    now: new Date("2026-10-21T12:00:00Z"),
  });
  const unfolded = ics.replace(/\r\n /g, "");

  test("writes UTC times and defaults a missing end to two hours", () => {
    expect(unfolded).toContain("DTSTART:20261022T220000Z");
    expect(unfolded).toContain("DTEND:20261023T000000Z");
    expect(unfolded).toContain("DTSTAMP:20261021T120000Z");
  });

  test("escapes text values", () => {
    expect(unfolded).toContain("SUMMARY:Ruby Montevideo Meetup\\, Octubre\\; 2026");
    expect(unfolded).toContain("DESCRIPTION:Organiza: Ruby Montevideo\\nMás info en el link");
  });

  test("uses CRLF and folds every line to 75 octets", () => {
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe(buildInvite, () => {
  const invite = {
    uid: "rsvp-abc-123@owu.uy",
    sequence: 2,
    title: "Cierre del año",
    start: "2029-11-26T22:00:00.000Z",
    end: "2029-11-27T00:00:00.000Z",
    location: "Sala, Cordón",
    url: "https://www.owu.uy/comunidad/x/events/y",
    description: "Tu entrada",
    organizer: { name: "OWU", email: "hola@mail.owu.uy" },
    attendee: { name: "Ana", email: "ana@example.com" },
  };

  test("a request updates the same entry, a cancel removes it", () => {
    const request = buildInvite({ ...invite, method: "REQUEST" }, new Date("2029-11-01T00:00:00Z")).replace(
      /\r\n /g,
      ""
    );
    const cancel = buildInvite({ ...invite, method: "CANCEL", sequence: 3 }).replace(/\r\n /g, "");

    expect(request).toContain("METHOD:REQUEST");
    expect(request).toContain("UID:rsvp-abc-123@owu.uy\r\nSEQUENCE:2");
    expect(request).toContain(
      'ATTENDEE;CN="Ana";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:ana@example.com'
    );
    expect(cancel).toContain("METHOD:CANCEL");
    expect(cancel).toContain("STATUS:CANCELLED");
  });

  test("a name can't add lines or properties to the invite", () => {
    const sneaky = buildInvite({
      ...invite,
      method: "REQUEST",
      attendee: { name: 'Ana\r\nATTACH:http://x"', email: "ana@example.com" },
    });

    expect(sneaky).not.toContain("\r\nATTACH");
    expect(sneaky.replace(/\r\n /g, "")).toContain('ATTENDEE;CN="Ana  ATTACH:http://x\'"');
  });
});
