import { describe, expect, test } from "vitest";

import { makeCommunity, makeEvent } from "test/factories";

import { GET } from "./evento.ics/route";
import EventCover from "./opengraph-image";

const at = (community: { slug: string }, event: { slug: string }) => ({
  params: Promise.resolve({ communitySlug: community.slug, eventSlug: event.slug }),
});

describe("an event's share image and calendar file", () => {
  test("the share image is a PNG", async () => {
    const community = await makeCommunity();
    const event = await makeEvent(community.id, { name: "Noche de charlas", status: "published" });
    const response = await EventCover(at(community, event));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    // The bytes too: a PNG starts with \x89PNG
    expect(
      Buffer.from(await response.arrayBuffer())
        .subarray(1, 4)
        .toString()
    ).toBe("PNG");
  });

  test("the .ics uses the feeds' UID, and a cancelled event tells calendars to drop it", async () => {
    const community = await makeCommunity();
    const live = await makeEvent(community.id, { status: "published" });
    const cancelled = await makeEvent(community.id, { status: "cancelled" });
    const read = async (event: { slug: string }) =>
      (await (await GET(new Request("https://www.owu.uy"), at(community, event))).text()).replace(/\r\n /g, "");

    await expect(read(live)).resolves.toContain(`UID:owu-${live.id}@owu.uy`);
    await expect(read(live)).resolves.not.toContain("STATUS:");
    await expect(read(cancelled)).resolves.toContain("STATUS:CANCELLED");
  });

  test("a draft has no calendar file", async () => {
    const community = await makeCommunity();
    const draft = await makeEvent(community.id, { status: "draft" });

    expect((await GET(new Request("https://www.owu.uy"), at(community, draft))).status).toBe(404);
  });
});
