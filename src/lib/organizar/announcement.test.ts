import { describe, expect, test } from "vitest";

import { announcementText, slackSafe, unlinked } from "./announcement";

describe(announcementText, () => {
  test("nothing organizers type becomes a link or a mention; the event's own link stays", () => {
    const text = announcementText({
      name: "Meetup en evil.example.com",
      summary: "Más en https://phish.example/login y escribile a @falso_soporte",
      startDate: "2026-11-26T22:00:00.000Z",
      place: "Sala Uno",
      community: "Python Montevideo",
      url: "https://www.owu.uy/comunidad/python/events/meetup",
    });

    expect(text).not.toMatch(/evil\.example|phish\.example|https:\/\/phish|@falso/);
    expect(text).toContain("👉 https://www.owu.uy/comunidad/python/events/meetup");
    expect(unlinked("Charlas de Node.js")).toBe("Charlas de Node\u2024js");
    expect(unlinked("Ver 10.0.0.1, ejemplo.рф o tg://resolve. Fin.")).not.toMatch(/\.\S|:\/\//);
  });
});

describe(slackSafe, () => {
  test("Slack's control sequences stay text", () => {
    expect(slackSafe("<!channel> & <@U123>")).toBe("&lt;!channel&gt; &amp; &lt;@U123&gt;");
  });
});
