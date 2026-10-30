import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import type * as z from "zod";

import { db } from "lib/db";
import { communities, communityClaims } from "lib/db/schema";
import type { UpdateCommunitySchema } from "lib/orpc/communities/schemas";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeMember, makeSiteAdmin, makeSlackUser, makeUser } from "test/factories";

const proposal = (name: string) => ({
  name,
  relation: "organizo" as const,
  links: ["https://www.meetup.com/rust-uy", "https://rust.uy"],
  topics: ["lenguajes" as const],
  message: "Hacemos meetups desde 2024",
});

describe("communities.propose", () => {
  test("a community not in OWU is proposed with a claim: unlisted and inactive until staff decide", async () => {
    const name = `Rust ${createId().slice(0, 6)}`;
    const organizer = await makeUser();

    const claim = await call(router.communities.propose, proposal(name), by(organizer));

    const [community] = await db.select().from(communities).where(eq(communities.id, claim.communityId));
    expect(community).toMatchObject({
      name,
      isActive: false,
      listed: false,
      topics: ["lenguajes"],
      links: { meetup: "https://www.meetup.com/rust-uy", website: "https://rust.uy" },
    });
    expect(community.slug).toMatch(/^rust-[a-z0-9]{6}$/);
    const [row] = await db.select().from(communityClaims).where(eq(communityClaims.id, claim.id));
    expect(row).toMatchObject({ proposed: true, status: "pending", userId: organizer.id });
    await expect(call(router.communities.propose, proposal(name), by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("a name OWU already has points to it; one already proposed waits for staff", async () => {
    const listed = await makeCommunity({ name: `Python Ñandú ${createId().slice(0, 6)}`, listed: true });
    const [first, second] = await Promise.all([makeUser(), makeUser()]);
    const name = `Go ${createId().slice(0, 6)}`;
    await call(router.communities.propose, proposal(name), by(first));

    // Same name, other accents and case
    await expect(
      call(router.communities.propose, proposal(listed.name.toUpperCase().replace("Ñ", "N")), by(second))
    ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "already_listed" } });
    await expect(call(router.communities.propose, proposal(name), by(second))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_proposed" },
    });
  });

  test("staff see it as a new community; approving lists it and makes the person its owner", async () => {
    const [organizer, staff] = await Promise.all([makeSlackUser(), makeSiteAdmin()]);
    const claim = await call(router.communities.propose, proposal(`Elixir ${createId().slice(0, 6)}`), by(organizer));

    const listed = await call(router.communities.claims.list, undefined, by(staff));
    expect(listed.find((item) => item.id === claim.id)).toMatchObject({
      proposed: true,
      community: { id: claim.communityId, hasOwner: false, topics: ["lenguajes"] },
    });

    await expect(
      call(router.communities.claims.decide, { claimId: claim.id, decision: "approve" }, by(staff))
    ).resolves.toMatchObject({ status: "approved", role: "owner" });
    const [community] = await db.select().from(communities).where(eq(communities.id, claim.communityId));
    expect(community).toMatchObject({ isActive: true, listed: true });
    const mine = await call(router.communities.mine, undefined, by(organizer));
    expect(mine.communities).toMatchObject([{ id: claim.communityId, role: "owner" }]);
  });

  test("rejected, it stays out of the directory", async () => {
    const [organizer, staff] = await Promise.all([makeUser(), makeSiteAdmin()]);
    const claim = await call(router.communities.propose, proposal(`Zig ${createId().slice(0, 6)}`), by(organizer));

    await call(router.communities.claims.decide, { claimId: claim.id, decision: "reject" }, by(staff));

    const [community] = await db.select().from(communities).where(eq(communities.id, claim.communityId));
    expect(community).toMatchObject({ isActive: false, listed: false });
  });
});

describe("communities.update (usual day and pause)", () => {
  test("an admin sets the usual day and a return date; leaving the pause drops the date", async () => {
    const community = await makeCommunity();
    const admin = await makeMember(community.id, "admin");
    const update = (data: z.input<typeof UpdateCommunitySchema>["data"]) =>
      call(router.communities.update, { communityId: community.id, data }, by(admin));

    await expect(
      update({
        status: "pausa",
        pausedUntil: "2029-03-01",
        recurringSlot: { weekday: 4, nth: 2, time: "19:00", durationMin: 120 },
      })
    ).resolves.toMatchObject({
      status: "pausa",
      pausedUntil: "2029-03-01",
      recurringSlot: { weekday: 4, nth: 2, time: "19:00", durationMin: 120 },
    });
    await expect(update({ status: "activa" })).resolves.toMatchObject({ status: "activa", pausedUntil: null });
    await expect(
      update({ recurringSlot: { weekday: 4, nth: 5 as never, time: "19:00", durationMin: 120 } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("access.request (from the panel's «No tenés acceso»)", () => {
  test("a member who helps at the door may ask to organize; an organizer is told they already are", async () => {
    const community = await makeCommunity();
    const [member, editor] = await Promise.all([
      makeMember(community.id, "member"),
      makeMember(community.id, "editor"),
    ]);

    await expect(
      call(router.access.request, { communityId: community.id, message: "Quiero ayudar a organizar" }, by(member))
    ).resolves.toMatchObject({ id: expect.any(String) });
    await expect(call(router.access.request, { communityId: community.id }, by(editor))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_member" },
    });
  });
});
