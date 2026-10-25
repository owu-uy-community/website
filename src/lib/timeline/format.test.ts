import { describe, expect, test } from "vitest";

import { formatDate, formatTime, plainText } from "./format";

describe(formatDate, () => {
  test("reads the day off the string, never shifting it through a timezone", () => {
    expect(formatDate({ start: "2012-02-09T19:00:00-02:00" })).toBe("9 feb 2012");
    expect(formatDate({ start: "2012-02-09T23:30:00-03:00" }, true)).toBe("9 de febrero de 2012");
  });

  test("is only as precise as the source", () => {
    expect(formatDate({ start: "2009-01" })).toBe("ene 2009");
    expect(formatDate({ start: "1990" })).toBe("1990");
  });

  test("joins a multi-day event within a month", () => {
    expect(formatDate({ start: "2014-03-14", end: "2014-03-15" })).toBe("14–15 mar 2014");
    expect(formatDate({ start: "2010-10-29", end: "2010-11-01" })).toBe("29 oct 2010");
  });

  test("gives the time only when the source has one", () => {
    expect(formatTime("2012-02-09T19:00:00-02:00")).toBe("19:00");
    expect(formatTime("2012-02-09")).toBeNull();
  });
});

describe(plainText, () => {
  test("reads a Meetup description as plain text", () => {
    expect(
      plainText(
        "**¡OWASP UY te invita a su próximo Meetup!**\n\nCharlas:\n- *API Security* · [Matías](https://x.y)\n- Más en <https://owasp.org>\n\n## Lugar\nSinergia\\_Faro"
      )
    ).toBe(
      "¡OWASP UY te invita a su próximo Meetup! Charlas: API Security · Matías Más en https://owasp.org Lugar Sinergia_Faro"
    );
  });
});
