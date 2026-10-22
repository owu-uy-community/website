import { describe, expect, test } from "vitest";

import { eventJsonLd, googleCalendarUrl, outlookCalendarUrl, safeJson, type DescribedEvent } from "./calendar-links";

const event: DescribedEvent = {
  name: "Cierre del año",
  summary: "Charlas y brindis",
  startDate: "2029-11-26T22:00:00.000Z",
  endDate: "2029-11-27T00:00:00.000Z",
  status: "published",
  mode: "presencial",
  place: { name: "Sala", area: "Cordón, Montevideo", address: null },
  registration: "owu",
  capacity: 2,
  taken: 2,
  community: { name: "Python Montevideo", slug: "python-montevideo" },
};

describe("describing an event", () => {
  test("the Google Calendar link carries UTC times and the area when the address is private", () => {
    const url = new URL(googleCalendarUrl(event, "https://www.owu.uy/x"));

    expect(url.searchParams.get("dates")).toBe("20291126T220000Z/20291127T000000Z");
    expect(url.searchParams.get("location")).toBe("Sala, Cordón, Montevideo");
  });

  test("the Outlook link carries UTC times and encodes spaces so Outlook doesn't show a +", () => {
    const link = outlookCalendarUrl({ ...event, name: "C++ y café" }, "https://www.owu.uy/x");
    const url = new URL(link);

    expect(url.searchParams.get("startdt")).toBe("2029-11-26T22:00:00.000Z");
    expect(url.searchParams.get("subject")).toBe("C++ y café");
    expect(link).toContain("subject=C%2B%2B%20y%20caf");
  });

  test("JSON-LD says sold out when full, cancelled when cancelled, and escapes markup", () => {
    expect(eventJsonLd(event, "u", "i").offers.availability).toBe("https://schema.org/SoldOut");
    expect(eventJsonLd({ ...event, status: "cancelled" }, "u", "i").eventStatus).toBe(
      "https://schema.org/EventCancelled"
    );
    expect(safeJson({ name: "</script><script>" })).not.toContain("</script>");
  });
});
