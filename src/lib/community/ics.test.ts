import { describe, expect, it } from "vitest";

import { buildIcs } from "./ics";

const event = {
  id: "meetup-260",
  title: "Ruby Montevideo Meetup, Octubre; 2026",
  start: "2026-10-22T19:00:00-03:00",
  end: null,
  location: "Effectus Software",
  url: "https://www.meetup.com/ruby-montevideo/events/316855290/",
  description: "Organiza: Ruby Montevideo\nMás info en el link",
};

describe("buildIcs", () => {
  const ics = buildIcs([event], {
    name: "OWU · Eventos",
    description: "Eventos tech en Uruguay",
    now: new Date("2026-10-21T12:00:00Z"),
  });
  const unfolded = ics.replace(/\r\n /g, "");

  it("writes UTC times and defaults a missing end to two hours", () => {
    expect(unfolded).toContain("DTSTART:20261022T220000Z");
    expect(unfolded).toContain("DTEND:20261023T000000Z");
    expect(unfolded).toContain("DTSTAMP:20261021T120000Z");
  });

  it("escapes text values", () => {
    expect(unfolded).toContain("SUMMARY:Ruby Montevideo Meetup\\, Octubre\\; 2026");
    expect(unfolded).toContain("DESCRIPTION:Organiza: Ruby Montevideo\\nMás info en el link");
  });

  it("uses CRLF and folds every line to 75 octets", () => {
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
  });
});
