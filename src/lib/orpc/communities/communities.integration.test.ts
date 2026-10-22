import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { communityMembers, emailDeliveries } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeSiteAdmin, makeUser } from "test/factories";

async function setup() {
  const community = await makeCommunity();
  const [owner, admin, editor, member, staff, stranger] = await Promise.all([
    makeMember(community.id, "owner"),
    makeMember(community.id, "admin"),
    makeMember(community.id, "editor"),
    makeMember(community.id, "member"),
    makeSiteAdmin(),
    makeUser(),
  ]);
  const membershipOf = async (userId: string) => {
    const [row] = await db.select().from(communityMembers).where(eq(communityMembers.userId, userId));

    return row;
  };

  return { community, owner, admin, editor, member, staff, stranger, membershipOf };
}

describe("communities.list", () => {
  test("lists active communities and hides inactive ones", async () => {
    const active = await makeCommunity({ name: "Activa" });
    const inactive = await makeCommunity({ name: "Inactiva", isActive: false });

    const ids = (await call(router.communities.list, undefined, by(null))).map((community) => community.id);

    expect(ids).toContain(active.id);
    expect(ids).not.toContain(inactive.id);
  });

  test("#21 an anonymous caller cannot list inactive communities", async () => {
    const inactive = await makeCommunity({ isActive: false });

    const ids = (await call(router.communities.list, { includeInactive: true }, by(null))).map((c) => c.id);

    expect(ids).not.toContain(inactive.id);
  });
});

describe("communities.listForAdmin", () => {
  test("site staff sees every community, inactive too, with its member and event counts", async () => {
    const { community } = await setup();
    await Promise.all([makeEvent(community.id), makeEvent(community.id)]);
    const empty = await makeCommunity({ isActive: false });
    const staff = await makeSiteAdmin();

    const list = await call(router.communities.listForAdmin, undefined, by(staff));

    expect(list.find((row) => row.id === community.id)).toMatchObject({ memberCount: 4, eventCount: 2 });
    expect(list.find((row) => row.id === empty.id)).toMatchObject({ isActive: false, memberCount: 0, eventCount: 0 });
  });

  test("it is site staff only: a community owner is refused", async () => {
    const { owner } = await setup();

    await expect(call(router.communities.listForAdmin, undefined, by(owner))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.communities.listForAdmin, undefined, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("communities.getBySlug", () => {
  test("returns the community, or null for an unknown slug", async () => {
    const community = await makeCommunity({ name: "Montevideo JS" });

    await expect(
      call(router.communities.getBySlug, { communitySlug: community.slug }, by(null))
    ).resolves.toMatchObject({ id: community.id, name: "Montevideo JS", isActive: true });
    await expect(call(router.communities.getBySlug, { communitySlug: "no-existe" }, by(null))).resolves.toBeNull();
  });
});

describe("communities.create", () => {
  test("site staff creates a community and becomes its owner", async () => {
    const staff = await makeSiteAdmin();
    const slug = `nueva-${Date.now()}`;

    const created = await call(router.communities.create, { slug, name: "Nueva" }, by(staff));
    const members = await call(router.communities.members.list, { communityId: created.id }, by(staff));

    expect(created).toMatchObject({ slug, name: "Nueva", isActive: true });
    expect(members.map((m) => [m.userId, m.role])).toStrictEqual([[staff.id, "owner"]]);
  });

  test("only site staff may create one", async () => {
    const user = await makeUser();
    const input = { slug: `otra-${Date.now()}`, name: "Otra" };

    await expect(call(router.communities.create, input, by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(call(router.communities.create, input, by(user))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("a reserved slug is rejected as invalid input", async () => {
    const staff = await makeSiteAdmin();

    await expect(call(router.communities.create, { slug: "admin", name: "Admin" }, by(staff))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("#12 a slug already in use is a CONFLICT", async () => {
    const staff = await makeSiteAdmin();
    const existing = await makeCommunity();

    await expect(
      call(router.communities.create, { slug: existing.slug, name: "Duplicada" }, by(staff))
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("communities.update", () => {
  test("a community admin renames the community", async () => {
    const { community, admin } = await setup();

    const updated = await call(
      router.communities.update,
      { communityId: community.id, data: { name: "Renombrada" } },
      by(admin)
    );

    expect(updated).toMatchObject({ id: community.id, name: "Renombrada" });
  });

  test("an admin edits the public profile: status, topics, links and the Slack channel", async () => {
    const { community, admin } = await setup();
    const data = {
      status: "busca-organizadores" as const,
      topics: ["web" as const, "web" as const, "data-ia" as const],
      links: { meetup: "https://www.meetup.com/montevideojs" },
      slackChannel: "montevideo-js",
    };

    await expect(
      call(router.communities.update, { communityId: community.id, data }, by(admin))
    ).resolves.toMatchObject({ ...data, topics: ["web", "data-ia"] });
    await expect(
      call(
        router.communities.update,
        { communityId: community.id, data: { links: { website: "ftp://example.com/montevideojs" } } },
        by(admin)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("editors and admins of other communities are refused", async () => {
    const { community, editor } = await setup();
    const elsewhere = await setup();
    const input = { communityId: community.id, data: { name: "Intento" } };

    await expect(call(router.communities.update, input, by(editor))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.communities.update, input, by(elsewhere.admin))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("#12 an empty patch is a BAD_REQUEST, not a crash", async () => {
    const { community, admin } = await setup();

    await expect(
      call(router.communities.update, { communityId: community.id, data: {} }, by(admin))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("communities.members", () => {
  test("a community admin sees every member with their role", async () => {
    const { community, owner, admin, editor, member } = await setup();

    const members = await call(router.communities.members.list, { communityId: community.id }, by(admin));

    expect(new Map(members.map((m) => [m.userId, m.role]))).toStrictEqual(
      new Map([
        [owner.id, "owner"],
        [admin.id, "admin"],
        [editor.id, "editor"],
        [member.id, "member"],
      ])
    );
  });

  test("plain members cannot list or change membership", async () => {
    const { community, member, stranger } = await setup();

    await expect(
      call(router.communities.members.list, { communityId: community.id }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.communities.members.add, { communityId: community.id, email: stranger.email }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("an admin adds someone by email; unknown emails are a BAD_REQUEST", async () => {
    const { community, admin, stranger, membershipOf } = await setup();

    await call(
      router.communities.members.add,
      { communityId: community.id, email: stranger.email.toUpperCase(), role: "editor" },
      by(admin)
    );

    expect((await membershipOf(stranger.id))?.role).toBe("editor");
    await expect(
      call(router.communities.members.add, { communityId: community.id, email: "nadie@test.owu.uy" }, by(admin))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("only an owner (or site staff) can grant the owner role", async () => {
    const { community, owner, admin, stranger, membershipOf } = await setup();
    const input = { communityId: community.id, email: stranger.email, role: "owner" as const };

    await expect(call(router.communities.members.add, input, by(admin))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await call(router.communities.members.add, input, by(owner));

    expect((await membershipOf(stranger.id))?.role).toBe("owner");
  });

  test("#4 re-adding an owner by email cannot demote them", async () => {
    const { community, owner, admin, membershipOf } = await setup();

    await expect(
      call(router.communities.members.add, { communityId: community.id, email: owner.email, role: "member" }, by(admin))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await membershipOf(owner.id))?.role).toBe("owner");
  });

  test("an owner changes roles and removes members", async () => {
    const { community, owner, editor, member, membershipOf } = await setup();
    const editorMembership = await membershipOf(editor.id);
    const memberMembership = await membershipOf(member.id);

    await call(
      router.communities.members.updateRole,
      { communityId: community.id, memberId: editorMembership.id, role: "admin" },
      by(owner)
    );
    await call(
      router.communities.members.remove,
      { communityId: community.id, memberId: memberMembership.id },
      by(owner)
    );

    expect((await membershipOf(editor.id))?.role).toBe("admin");
    await expect(membershipOf(member.id)).resolves.toBeUndefined();
  });

  test("#12 demoting or removing the last owner is a CONFLICT", async () => {
    const { community, owner, membershipOf } = await setup();
    const ownerMembership = await membershipOf(owner.id);

    await expect(
      call(
        router.communities.members.updateRole,
        { communityId: community.id, memberId: ownerMembership.id, role: "member" },
        by(owner)
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      call(router.communities.members.remove, { communityId: community.id, memberId: ownerMembership.id }, by(owner))
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("#12 an admin touching an owner is FORBIDDEN and an unknown member is NOT_FOUND", async () => {
    const { community, owner, admin, membershipOf } = await setup();
    const ownerMembership = await membershipOf(owner.id);

    await expect(
      call(router.communities.members.remove, { communityId: community.id, memberId: ownerMembership.id }, by(admin))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.communities.members.remove, { communityId: community.id, memberId: "no-existe" }, by(admin))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("two owners removing each other at once leaves exactly one owner", async () => {
    const { community, owner, membershipOf } = await setup();
    const secondOwner = await makeMember(community.id, "owner");
    const [first, second] = await Promise.all([membershipOf(owner.id), membershipOf(secondOwner.id)]);

    const results = await Promise.allSettled([
      call(router.communities.members.remove, { communityId: community.id, memberId: second.id }, by(owner)),
      call(router.communities.members.remove, { communityId: community.id, memberId: first.id }, by(secondOwner)),
    ]);

    const owners = await call(
      router.communities.members.list,
      { communityId: community.id },
      by(await makeSiteAdmin())
    );

    // Whoever went second was no longer an owner — or no longer a member — by the time it ran.
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(owners.filter((member) => member.role === "owner")).toHaveLength(1);
  });

  test("not even site staff can demote or remove the only owner", async () => {
    const { community, owner, staff, membershipOf } = await setup();
    const ownerMembership = await membershipOf(owner.id);

    await expect(
      call(
        router.communities.members.updateRole,
        { communityId: community.id, memberId: ownerMembership.id, role: "admin" },
        by(staff)
      )
    ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "last_owner" } });
    await expect(
      call(router.communities.members.remove, { communityId: community.id, memberId: ownerMembership.id }, by(staff))
    ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "last_owner" } });

    // With a second owner, the first one can step down.
    await makeMember(community.id, "owner");
    await call(
      router.communities.members.updateRole,
      { communityId: community.id, memberId: ownerMembership.id, role: "admin" },
      by(staff)
    );
    expect((await membershipOf(owner.id))?.role).toBe("admin");
  });

  test("site staff manages any community without a membership", async () => {
    const { community, editor, staff, membershipOf } = await setup();
    const editorMembership = await membershipOf(editor.id);

    await call(
      router.communities.members.updateRole,
      { communityId: community.id, memberId: editorMembership.id, role: "member" },
      by(staff)
    );

    expect((await membershipOf(editor.id))?.role).toBe("member");
  });
});

describe("communities.delete", () => {
  test("site staff deletes a community with no events, and its members go with it", async () => {
    const { community, staff } = await setup();

    await call(router.communities.delete, { communityId: community.id }, by(staff));

    await expect(call(router.communities.getBySlug, { communitySlug: community.slug }, by(staff))).resolves.toBeNull();
    await expect(
      db.select().from(communityMembers).where(eq(communityMembers.communityId, community.id))
    ).resolves.toStrictEqual([]);
  });

  test("while it has events it stays, saying how many; and only site staff delete one", async () => {
    const { community, owner, staff } = await setup();
    await makeEvent(community.id);
    await makeEvent(community.id);

    await expect(call(router.communities.delete, { communityId: community.id }, by(owner))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.communities.delete, { communityId: community.id }, by(staff))).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("tiene 2 eventos"),
    });
    await expect(
      call(router.communities.getBySlug, { communitySlug: community.slug }, by(staff))
    ).resolves.toMatchObject({ id: community.id });
  });
});

describe("communities.members.showOnProfile", () => {
  test("an organizer shows themselves on the public page, and only themselves", async () => {
    const { community, editor, admin, member, membershipOf } = await setup();
    const show = { communityId: community.id, show: true };

    await expect(call(router.communities.members.showOnProfile, show, by(editor))).resolves.toStrictEqual({
      showOnProfile: true,
    });
    expect((await membershipOf(editor.id)).showOnProfile).toBe(true);
    expect((await membershipOf(admin.id)).showOnProfile).toBe(false);
    await expect(call(router.communities.members.showOnProfile, show, by(member))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("site staff outside the team have no membership to show", async () => {
    const { community, staff } = await setup();

    await expect(
      call(router.communities.members.showOnProfile, { communityId: community.id, show: true }, by(staff))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("communities.claim", () => {
  const claimInput = (communityId: string) => ({ communityId, relation: "organizo" as const, message: "", link: null });

  test("a signed-in person asks once; a pending claim can't be sent again", async () => {
    const community = await makeCommunity({ listed: true });
    const organizer = await makeUser();

    const claim = await call(router.communities.claim, claimInput(community.id), by(organizer));

    expect(claim).toMatchObject({ communityId: community.id, status: "pending" });
    await expect(call(router.communities.claim, claimInput(community.id), by(organizer))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "claim_pending" },
    });
    await expect(call(router.communities.claim, claimInput(community.id), by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("someone who already organizes the community can't claim it", async () => {
    const { community, editor } = await setup();

    await expect(call(router.communities.claim, claimInput(community.id), by(editor))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_member" },
    });
  });

  test("only site staff list and decide claims", async () => {
    const community = await makeCommunity({ listed: true });
    const [organizer, staff] = await Promise.all([makeUser(), makeSiteAdmin()]);
    const claim = await call(router.communities.claim, claimInput(community.id), by(organizer));

    const pending = await call(router.communities.claims.list, undefined, by(staff));

    expect(pending.find((item) => item.id === claim.id)).toMatchObject({
      status: "pending",
      community: { id: community.id, hasOwner: false },
      user: { id: organizer.id },
    });
    await expect(
      call(router.communities.claims.decide, { claimId: claim.id, decision: "approve" }, by(organizer))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("approving makes the first organizer owner and the next ones editors; mine lists them", async () => {
    const community = await makeCommunity({ listed: true });
    const [first, second, staff] = await Promise.all([makeUser(), makeUser(), makeSiteAdmin()]);
    const firstClaim = await call(router.communities.claim, claimInput(community.id), by(first));
    const secondClaim = await call(router.communities.claim, claimInput(community.id), by(second));
    const decide = (claimId: string, decision: "approve" | "reject") =>
      call(router.communities.claims.decide, { claimId, decision }, by(staff));

    await expect(decide(firstClaim.id, "approve")).resolves.toMatchObject({ status: "approved", role: "owner" });
    await expect(decide(secondClaim.id, "approve")).resolves.toMatchObject({ status: "approved", role: "editor" });
    await expect(decide(secondClaim.id, "reject")).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "claim_decided" },
    });

    const mine = await call(router.communities.mine, undefined, by(first));
    expect(mine.communities).toStrictEqual([
      { id: community.id, slug: community.slug, name: community.name, logoUrl: null, role: "owner" },
    ]);
    expect(mine.claims[0]).toMatchObject({ id: firstClaim.id, status: "approved" });
  });

  test("the organizer hears back by email, approved or not", async () => {
    const [approved, rejected] = await Promise.all([
      makeCommunity({ listed: true, name: "Rust Montevideo" }),
      makeCommunity({ listed: true, name: "Go Uruguay" }),
    ]);
    const [organizer, staff] = await Promise.all([makeUser(), makeSiteAdmin()]);
    const yes = await call(router.communities.claim, claimInput(approved.id), by(organizer));
    const no = await call(router.communities.claim, claimInput(rejected.id), by(organizer));
    await call(router.communities.claims.decide, { claimId: yes.id, decision: "approve" }, by(staff));
    await call(router.communities.claims.decide, { claimId: no.id, decision: "reject" }, by(staff));

    const mail = await db
      .select()
      .from(emailDeliveries)
      .where(and(eq(emailDeliveries.kind, "claim_decided"), eq(emailDeliveries.to, organizer.email)))
      .orderBy(emailDeliveries.createdAt);

    expect(mail.map((row) => row.subject)).toStrictEqual([
      "Ya organizás Rust Montevideo en OWU",
      "Tu pedido para organizar Go Uruguay",
    ]);
    expect(mail[0].html).toContain(`/organizar/panel/${approved.slug}`);
  });

  test("a rejected claim can be sent again", async () => {
    const community = await makeCommunity({ listed: true });
    const [organizer, staff] = await Promise.all([makeUser(), makeSiteAdmin()]);
    const claim = await call(router.communities.claim, claimInput(community.id), by(organizer));
    await call(router.communities.claims.decide, { claimId: claim.id, decision: "reject" }, by(staff));

    const again = await call(
      router.communities.claim,
      { ...claimInput(community.id), message: "Ahora sí organizo" },
      by(organizer)
    );

    expect(again).toMatchObject({ id: claim.id, status: "pending" });
  });
});
