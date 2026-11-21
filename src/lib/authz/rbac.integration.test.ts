import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { call, type RouterClient } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { POST as rpc } from "app/api/orpc/[[...rest]]/route";
import { auth } from "app/lib/auth";
import { db } from "lib/db";
import { account, auditLog, communities, communityMembers, invitations, session, user } from "lib/db/schema";
import { router, type AppRouter } from "lib/orpc/router";
import { by } from "test/context";
import {
  linkSlack,
  makeBoard,
  makeCommunity,
  makeMember,
  makePlatformUser,
  makeServiceAccount,
  makeSiteAdmin,
  makeSlackUser,
  makeUser,
} from "test/factories";
import { mintSession } from "test/session";

import { KEY_PRESETS, mintServiceKey } from "./keys";
import { applyInvitations } from "./people";
import { can, principalOf } from "./principal";
import { OWU_SLACK_REQUIRED_FROM } from "./slack";

/**
 * Access control end to end: every hole found in the October 2026 review (P1–P9) stays closed, and
 * the allowlist, the waitlist, custom roles, bans, keys and the Owy bot's delegation behave.
 */

const ORIGIN = "http://owu.test";
const client = (headers: Record<string, string>): RouterClient<AppRouter> =>
  createORPCClient(
    new RPCLink({
      origin: ORIGIN,
      url: "/api/orpc",
      headers: () => headers,
      fetch: (url, init) => rpc(new Request(url, init)),
    })
  );
const cookieOf = async (userId: string) => {
  const { name, value } = await mintSession(userId);

  return `${name}=${value}`;
};
const membershipOf = async (communityId: string, userId: string) =>
  (
    await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
  )[0];

describe("revocation counts on the next request", () => {
  test("P6 a site admin demoted in the database loses staff access right away, cookie cache or not", async () => {
    const staff = await makeSiteAdmin();
    const cookie = await cookieOf(staff.id);
    // A browser's first get-session sets Better Auth's signed session_data cache cookie
    const warm = await auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }));
    const cache = warm.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .find((value) => value.includes("session_data"));
    expect(cache).toBeDefined();
    const both = { cookie: `${cookie}; ${cache}` };

    await expect(client(both).communities.listForAdmin()).resolves.toBeDefined();
    await db.update(user).set({ role: "user" }).where(eq(user.id, staff.id));

    await expect(client(both).communities.listForAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("P1 a ban (the replacement for the never-enforced status) shuts every door: sessions, procedures, keys", async () => {
    const [moderator, member] = await Promise.all([makePlatformUser("moderator"), makeSlackUser()]);
    const cookie = { cookie: await cookieOf(member.id) };
    await expect(client(cookie).communities.mine()).resolves.toBeDefined();

    await call(router.access.users.ban, { userId: member.id, reason: "Spam en el Slack", days: 7 }, by(moderator));

    await expect(client(cookie).communities.mine()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(db.select().from(session).where(eq(session.userId, member.id))).resolves.toHaveLength(0);
    // Better Auth refuses new sessions too
    expect((await principalOf(member.id))?.banned).toBe(true);

    await call(router.access.users.unban, { userId: member.id }, by(moderator));
    await expect(client({ cookie: await cookieOf(member.id) }).communities.mine()).resolves.toBeDefined();
  });

  test("a ban that expired lifts by itself", async () => {
    const banned = await makeSlackUser({ banned: true, banExpires: new Date(Date.now() - 60_000) });

    await expect(client({ cookie: await cookieOf(banned.id) }).communities.mine()).resolves.toBeDefined();
  });

  test("moderators can't ban themselves or anyone holding more than they do", async () => {
    const [moderator, staff] = await Promise.all([makePlatformUser("moderator"), makeSiteAdmin()]);

    await expect(
      call(router.access.users.ban, { userId: moderator.id, reason: "yo mismo" }, by(moderator))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.access.users.ban, { userId: staff.id, reason: "no le toca" }, by(moderator))
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("community roles", () => {
  test("P2 an admin can't demote, remove or make admins; owners can", async () => {
    const community = await makeCommunity();
    const [owner, admin, peer, editor] = await Promise.all([
      makeMember(community.id, "owner"),
      makeMember(community.id, "admin"),
      makeMember(community.id, "admin"),
      makeMember(community.id, "editor"),
    ]);
    const peerRow = await membershipOf(community.id, peer.id);
    const editorRow = await membershipOf(community.id, editor.id);

    for (const attempt of [
      () =>
        call(
          router.communities.members.updateRole,
          { communityId: community.id, memberId: peerRow.id, role: "member" },
          by(admin)
        ),
      () => call(router.communities.members.remove, { communityId: community.id, memberId: peerRow.id }, by(admin)),
      () =>
        call(
          router.communities.members.updateRole,
          { communityId: community.id, memberId: editorRow.id, role: "admin" },
          by(admin)
        ),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // Below them, admins still run the team
    await call(
      router.communities.members.updateRole,
      { communityId: community.id, memberId: editorRow.id, role: "member" },
      by(admin)
    );
    await call(
      router.communities.members.updateRole,
      { communityId: community.id, memberId: peerRow.id, role: "editor" },
      by(owner)
    );

    expect((await membershipOf(community.id, peer.id)).role).toBe("editor");
  });

  test("nobody raises their own role, not even from the bottom", async () => {
    const community = await makeCommunity();
    const [, admin] = await Promise.all([makeMember(community.id, "owner"), makeMember(community.id, "admin")]);
    const row = await membershipOf(community.id, admin.id);

    await expect(
      call(
        router.communities.members.updateRole,
        { communityId: community.id, memberId: row.id, role: "owner" },
        by(admin)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("P4 a deactivated community's members lose access; platform staff keep it", async () => {
    const { community, event } = await makeBoard();
    const editor = await makeMember(community.id, "editor");
    await db.update(communities).set({ isActive: false }).where(eq(communities.id, community.id));

    await expect(call(router.events.list, { communityId: community.id }, by(editor))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      call(router.events.list, { communityId: community.id }, by(await makeSiteAdmin()))
    ).resolves.toStrictEqual(expect.arrayContaining([expect.objectContaining({ id: event.id })]));
  });

  test("P9 approving a claim never demotes: a claimant who became sole owner meanwhile stays owner", async () => {
    const community = await makeCommunity({ listed: true });
    const [staff, claimant] = await Promise.all([makeSiteAdmin(), makeSlackUser()]);
    const claimed = await call(
      router.communities.claim,
      { communityId: community.id, relation: "organizo", message: "" },
      by(claimant)
    );
    await call(
      router.communities.members.add,
      { communityId: community.id, email: claimant.email, role: "owner" },
      by(staff)
    );

    await expect(
      call(router.communities.claims.decide, { claimId: claimed.id, decision: "approve" }, by(staff))
    ).resolves.toMatchObject({ status: "approved", role: "owner" });
    expect((await membershipOf(community.id, claimant.id)).role).toBe("owner");
  });

  test("the database itself keeps a community from losing its last owner", async () => {
    const community = await makeCommunity();
    const owner = await makeMember(community.id, "owner");

    await expect(
      db.update(communityMembers).set({ role: "member" }).where(eq(communityMembers.userId, owner.id))
    ).rejects.toMatchObject({ cause: expect.objectContaining({ constraint: "community_keeps_owner" }) });
    // Swapping owners inside one transaction is fine (the rule is checked at commit)
    const next = await makeMember(community.id, "member");
    await db.transaction(async (tx) => {
      await tx.update(communityMembers).set({ role: "member" }).where(eq(communityMembers.userId, owner.id));
      await tx.update(communityMembers).set({ role: "owner" }).where(eq(communityMembers.userId, next.id));
    });
    expect((await membershipOf(community.id, next.id)).role).toBe("owner");
  });

  test("the sole owner of a community with a team can't delete their account; with someone else owning, they can", async () => {
    const community = await makeCommunity();
    const [owner] = await Promise.all([makeMember(community.id, "owner"), makeMember(community.id, "member")]);
    const deleteMe = async () =>
      auth.handler(
        new Request(`${ORIGIN}/api/auth/delete-user`, {
          method: "POST",
          headers: { cookie: await cookieOf(owner.id), "content-type": "application/json", origin: ORIGIN },
          body: "{}",
        })
      );

    const refused = await deleteMe();
    expect(refused.status).toBe(400);
    await expect(refused.text()).resolves.toContain("único dueño");
    await makeMember(community.id, "owner");
    expect((await deleteMe()).status).toBe(200);
  });

  test("leaving: anyone but the last owner", async () => {
    const community = await makeCommunity();
    const [owner, member] = await Promise.all([makeMember(community.id, "owner"), makeMember(community.id, "member")]);

    await call(router.communities.members.leave, { communityId: community.id }, by(member));
    await expect(membershipOf(community.id, member.id)).resolves.toBeUndefined();
    await expect(
      call(router.communities.members.leave, { communityId: community.id }, by(owner))
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("custom roles", () => {
  test("an owner defines a door role: it checks people in and sees nothing else", async () => {
    const { community, event } = await makeBoard();
    const owner = await makeMember(community.id, "owner");
    await call(
      router.communities.roles.create,
      {
        communityId: community.id,
        label: "Voluntariado puerta",
        description: "",
        permissions: ["event:list", "attendee:checkin", "attendee:checkins"],
      },
      by(owner)
    );
    const volunteer = await makeMember(community.id, "voluntariado-puerta");

    await expect(call(router.attendees.checkins, { eventId: event.id }, by(volunteer))).resolves.toBeDefined();
    await expect(call(router.attendees.list, { eventId: event.id }, by(volunteer))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.staffTasks.list, { eventId: event.id }, by(volunteer))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const roles = await call(router.communities.roles.list, { communityId: community.id }, by(owner));
    expect(roles.find((role) => role.role === "voluntariado-puerta")).toMatchObject({ builtIn: false, members: 1 });
  });

  test("no escalation: an admin can't define or hand out a role holding more than they do", async () => {
    const community = await makeCommunity();
    const [owner, admin, editor] = await Promise.all([
      makeMember(community.id, "owner"),
      makeMember(community.id, "admin"),
      makeMember(community.id, "editor"),
    ]);
    await expect(
      call(
        router.communities.roles.create,
        { communityId: community.id, label: "Casi dueño", description: "", permissions: ["member:manage-owners"] },
        by(owner)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Admins hold door-link, so they can define a role with it…
    await call(
      router.communities.roles.create,
      { communityId: community.id, label: "Puerta", description: "", permissions: ["event:door-link"] },
      by(admin)
    );
    // …but an editor can't make one that opens the door: they don't hold it
    await expect(
      call(
        router.communities.roles.create,
        { communityId: community.id, label: "Abre puerta", description: "", permissions: ["event:door-link"] },
        by(editor)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("a role in use can't be deleted; unused, it can", async () => {
    const community = await makeCommunity();
    const owner = await makeMember(community.id, "owner");
    const create = (label: string) =>
      call(
        router.communities.roles.create,
        { communityId: community.id, label, description: "", permissions: ["task:read"] },
        by(owner)
      );
    await create("Lectura");
    await create("Sin uso");
    await makeMember(community.id, "lectura");

    await expect(
      call(router.communities.roles.delete, { communityId: community.id, role: "lectura" }, by(owner))
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await call(router.communities.roles.delete, { communityId: community.id, role: "sin-uso" }, by(owner));
  });
});

describe("the OWU Slack requirement", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("roles count for people on the OWU Slack; after the grace date, nobody else's do", async () => {
    const community = await makeCommunity();
    const [linked, unlinked, otherWorkspace] = await Promise.all([
      makeMember(community.id, "editor"),
      makeMember(community.id, "editor", {}, { slack: false }),
      makeMember(community.id, "editor", {}, { slack: false }),
    ]);
    await linkSlack(otherWorkspace.id, "T0OTHER");

    const check = async (userId: string) => can(await principalOf(userId), "event:create", community.id);
    expect([await check(linked.id), await check(unlinked.id), await check(otherWorkspace.id)]).toStrictEqual([
      true,
      true,
      true,
    ]);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(OWU_SLACK_REQUIRED_FROM.getTime() + 1000));
    expect([await check(linked.id), await check(unlinked.id), await check(otherWorkspace.id)]).toStrictEqual([
      true,
      false,
      false,
    ]);
  });

  test("leaving the OWU Slack (the daily sync marks it) ends their roles", async () => {
    const community = await makeCommunity();
    const editor = await makeMember(community.id, "editor");
    await db.update(user).set({ slackDeactivatedAt: new Date() }).where(eq(user.id, editor.id));

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(OWU_SLACK_REQUIRED_FROM.getTime() + 1000));
    await expect(can(await principalOf(editor.id), "event:create", community.id)).resolves.toBe(false);
  });

  test("new platform roles need the OWU Slack, grace date or not", async () => {
    const [superadmin, unlinked, linked] = await Promise.all([
      makePlatformUser("superadmin"),
      makeUser(),
      makeSlackUser(),
    ]);

    await expect(
      call(router.access.users.setRoles, { userId: unlinked.id, roles: ["staff"] }, by(superadmin))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      call(router.access.users.setRoles, { userId: linked.id, roles: ["staff"] }, by(superadmin))
    ).resolves.toStrictEqual({
      roles: ["staff"],
    });
  });
});

describe("platform roles", () => {
  test("only superadmins set roles, never their own, and the last superadmin stays", async () => {
    const [superadmin, moderator, target] = await Promise.all([
      makePlatformUser("superadmin"),
      makePlatformUser("moderator"),
      makeSlackUser(),
    ]);
    await db
      .update(user)
      .set({ role: "user" })
      .where(and(eq(user.role, "superadmin")));
    await db.update(user).set({ role: "superadmin" }).where(eq(user.id, superadmin.id));

    await expect(
      call(router.access.users.setRoles, { userId: target.id, roles: ["staff"] }, by(moderator))
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      call(router.access.users.setRoles, { userId: superadmin.id, roles: [] }, by(superadmin))
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await call(router.access.users.setRoles, { userId: target.id, roles: ["superadmin"] }, by(superadmin));
    await call(router.access.users.setRoles, { userId: superadmin.id, roles: ["moderator"] }, by(target));
    await expect(
      call(router.access.users.setRoles, { userId: target.id, roles: [] }, by(await makePlatformUser("superadmin")))
    ).resolves.toBeDefined();
  });

  test("legacy 'admin' still reads as staff until the data migration runs", async () => {
    const legacy = await makeSlackUser({ role: "admin" });
    const principal = await principalOf(legacy.id);

    expect(principal?.roles).toStrictEqual(["staff"]);
    await expect(can(principal, "program:manage")).resolves.toBe(true);
    await expect(can(principal, "user:set-role")).resolves.toBe(false);
  });
});

describe("the allowlist: invitations", () => {
  test("an invitation to an email or an OWU Slack id applies at sign-in, once, and never lowers a role", async () => {
    const community = await makeCommunity();
    const owner = await makeMember(community.id, "owner");
    const byEmail = await makeUser();
    const bySlack = await makeUser();
    const slackId = "U0INVITED1";

    await call(
      router.communities.members.add,
      { communityId: community.id, email: byEmail.email, role: "editor" },
      by(owner)
    );
    await call(
      router.communities.members.add,
      { communityId: community.id, slackUserId: slackId, role: "member" },
      by(owner)
    );
    await call(
      router.access.invitations.create,
      { email: byEmail.email, roles: ["moderator"] },
      by(await makePlatformUser("superadmin"))
    );

    const roles = async () => [
      (await membershipOf(community.id, byEmail.id))?.role,
      (await membershipOf(community.id, bySlack.id))?.role,
      (await db.select({ role: user.role }).from(user).where(eq(user.id, byEmail.id)))[0].role,
    ];

    // Not on the OWU Slack yet: nothing applies. Once linked, each applies exactly once
    const applied = [await applyInvitations(byEmail.id)];
    await linkSlack(byEmail.id);
    await linkSlack(bySlack.id, undefined, slackId);
    for (const userId of [byEmail.id, bySlack.id, bySlack.id]) applied.push(await applyInvitations(userId));
    expect(applied).toStrictEqual([0, 2, 1, 0]);
    await expect(roles()).resolves.toStrictEqual(["editor", "member", "moderator"]);

    // A later, lower invitation doesn't demote
    await db.insert(invitations).values({
      communityId: community.id,
      role: "member",
      email: byEmail.email,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await applyInvitations(byEmail.id);
    await expect(roles()).resolves.toStrictEqual(["editor", "member", "moderator"]);
  });

  test("revoked and expired invitations never apply", async () => {
    const community = await makeCommunity();
    const owner = await makeMember(community.id, "owner");
    const person = await makeSlackUser();
    const [revoked] = await db
      .insert(invitations)
      .values({
        communityId: community.id,
        role: "editor",
        email: person.email,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    await db.insert(invitations).values({
      communityId: community.id,
      role: "admin",
      email: person.email,
      expiresAt: new Date(Date.now() - 1000),
    });
    await call(
      router.communities.invitations.revoke,
      { communityId: community.id, invitationId: revoked.id },
      by(owner)
    );

    await expect(applyInvitations(person.id)).resolves.toBe(0);
    await expect(membershipOf(community.id, person.id)).resolves.toBeUndefined();
  });

  test("signing in applies them (Better Auth's session hook)", async () => {
    const community = await makeCommunity();
    const owner = await makeMember(community.id, "owner");
    const person = await makeSlackUser();
    await db.insert(invitations).values({
      communityId: community.id,
      role: "editor",
      email: person.email,
      invitedById: owner.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    // A real session creation, as after a Slack sign-in
    const ctx = await auth.$context;
    await ctx.internalAdapter.createSession(person.id);
    await vi.waitFor(async () => expect((await membershipOf(community.id, person.id))?.role).toBe("editor"));
  });
});

describe("the waitlist: access requests", () => {
  test("someone asks, a community admin approves for their community only, the person gets in", async () => {
    const [{ community }, other] = await Promise.all([makeBoard(), makeCommunity()]);
    const [admin, otherAdmin] = await Promise.all([makeMember(community.id, "admin"), makeMember(other.id, "admin")]);
    const asker = await makeSlackUser();

    const { id } = await call(
      router.access.request,
      { communityId: community.id, message: "Quiero ayudar en la puerta" },
      by(asker)
    );
    await expect(
      call(router.access.request, { communityId: community.id, message: "" }, by(asker))
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      call(
        router.communities.requests.decide,
        { communityId: other.id, requestId: id, decision: "approve", role: "member" },
        by(otherAdmin)
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await call(
      router.communities.requests.decide,
      { communityId: community.id, requestId: id, decision: "approve", role: "member" },
      by(admin)
    );
    expect((await membershipOf(community.id, asker.id)).role).toBe("member");
    const me = await call(router.access.me, undefined, by(asker));
    expect(me.requests[0]).toMatchObject({ id, status: "approved" });
  });

  test("a dashboard request is decided by moderators, never by the person themselves", async () => {
    const community = await makeCommunity();
    const [moderator, asker] = await Promise.all([makePlatformUser("moderator"), makePlatformUser("moderator")]);
    await db.update(user).set({ role: "user" }).where(eq(user.id, asker.id));
    const { id } = await call(router.access.request, { communityId: null, message: "Organizo GDG" }, by(asker));
    await db.update(user).set({ role: "moderator" }).where(eq(user.id, asker.id));

    await expect(
      call(
        router.access.requests.decide,
        { requestId: id, decision: "approve", grant: { communityId: community.id, role: "editor" } },
        by(asker)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(
        router.access.requests.decide,
        { requestId: id, decision: "approve", grant: { communityId: community.id, role: "editor" } },
        by(moderator)
      )
    ).resolves.toMatchObject({ status: "approved", grantedRole: "editor" });
    // Platform roles take user:set-role, which moderators don't hold
    const another = await makeSlackUser();
    const second = await call(router.access.request, { communityId: null, message: "" }, by(another));
    await expect(
      call(
        router.access.requests.decide,
        { requestId: second.id, decision: "approve", grant: { platformRoles: ["staff"] } },
        by(moderator)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("small doors", () => {
  test("only people who can add someone somewhere may search the OWU Slack's members", async () => {
    const community = await makeCommunity();
    const [admin, attendee] = await Promise.all([makeMember(community.id, "admin"), makeSlackUser()]);

    await expect(call(router.access.slackMembers, { q: "ana" }, by(attendee))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // No Slack token in tests: an empty list, but allowed
    await expect(call(router.access.slackMembers, { q: "ana" }, by(admin))).resolves.toStrictEqual([]);
  });

  test("approving site roles for someone not on the OWU Slack leaves them as an invitation", async () => {
    const [superadmin, asker] = await Promise.all([makePlatformUser("superadmin"), makeUser()]);
    const { id } = await call(router.access.request, { communityId: null, message: "" }, by(asker));

    await expect(
      call(
        router.access.requests.decide,
        { requestId: id, decision: "approve", grant: { platformRoles: ["staff"] } },
        by(superadmin)
      )
    ).resolves.toMatchObject({ status: "approved", invited: true });
    await linkSlack(asker.id);
    await expect(applyInvitations(asker.id)).resolves.toBe(1);
    await expect(principalOf(asker.id)).resolves.toMatchObject({ roles: ["staff"] });
  });

  test("a Telegram is unlinked only by its person, never by someone viewing the site as them", async () => {
    const person = await makeSlackUser();
    const viewing = by(person);
    (await viewing.context.getSession())!.session = {
      ...(await viewing.context.getSession())!.session,
      impersonatedBy: "someone",
    } as never;

    await expect(call(router.access.telegram.unlink, undefined, viewing)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.access.telegram.unlink, undefined, by(person))).resolves.toStrictEqual({ success: true });
  });
});

describe("API keys and the Owy bot", () => {
  test("P8 nobody mints or lists keys over HTTP; keys only come from the server, for machines", async () => {
    const person = await makeSlackUser();
    const cookie = await cookieOf(person.id);
    for (const path of ["/api-key/create", "/api-key/list", "/admin/set-role", "/admin/list-users"]) {
      const response = await auth.handler(
        new Request(`${ORIGIN}/api/auth${path}`, {
          method: path.endsWith("create") || path.endsWith("set-role") ? "POST" : "GET",
          headers: { cookie, "content-type": "application/json", origin: ORIGIN },
          ...(path.endsWith("create") || path.endsWith("set-role")
            ? { body: JSON.stringify({ name: "mine", userId: person.id, role: "admin" }) }
            : {}),
        })
      );
      expect([path, response.status]).toStrictEqual([path, 404]);
    }
  });

  test("a key's permissions cap it: the Stream Deck fires presets and can't read anything else", async () => {
    const { event } = await makeBoard();
    const deck = await makeServiceAccount({ id: "deck-cap-test" });
    const { key } = await mintServiceKey({
      ownerId: deck.id,
      name: "deck",
      permissions: KEY_PRESETS["stream-deck"],
      expiresInDays: 1,
      createdById: null,
    });

    await expect(client({ "x-api-key": key }).obsControl.status({ instanceId: 1 })).resolves.toBeDefined();
    await expect(client({ "x-api-key": key }).attendees.checkins({ eventId: event.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(client({ "x-api-key": key }).semanario.listAll()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("the bot acts for the person talking to it: staff may, others may not, strangers only report", async () => {
    const { event, rooms, slots } = await makeBoard();
    const bot = await makeServiceAccount({ id: "owy-delegation-test" });
    const { key } = await mintServiceKey({
      ownerId: bot.id,
      name: "owy",
      permissions: KEY_PRESETS.owy,
      expiresInDays: 1,
      createdById: null,
    });
    const [staff, attendee] = await Promise.all([
      makeSiteAdmin({ name: "Staff" }),
      makeSlackUser({ name: "Asistente" }),
    ]);
    const staffSlack = (await db.select().from(account).where(eq(account.userId, staff.id)))[0].accountId;
    const attendeeSlack = (await db.select().from(account).where(eq(account.userId, attendee.id)))[0].accountId;
    const asSlack = (slackId: string) => client({ "x-api-key": key, "x-owu-actor": `slack:${slackId}` });
    const talk = {
      title: "Charla",
      openSpaceId: event.id,
      scheduleId: slots.early.id,
      roomId: rooms.plain.id,
      needsTV: false,
      needsWhiteboard: false,
      skipResourceValidation: false,
    };

    // Staff may put a talk on the board through Owy; an attendee and a stranger may not
    const outcomes: string[] = [];
    for (const [slackId, roomId] of [
      [staffSlack, rooms.plain.id],
      [attendeeSlack, rooms.tv.id],
      ["U0NOBODY", rooms.tv.id],
    ] as const) {
      outcomes.push(
        await asSlack(slackId)
          .tracks.create({ ...talk, roomId })
          .then(
            () => "ok",
            (error: { code?: string }) => error.code ?? "?"
          )
      );
    }
    expect(outcomes).toStrictEqual(["ok", "FORBIDDEN", "FORBIDDEN"]);
    // Anyone can report a problem through Owy
    await expect(
      asSlack(attendeeSlack).incidents.create({
        eventId: event.id,
        title: "No hay agua",
        severity: "low",
        category: "venue",
      })
    ).resolves.toMatchObject({ source: "owy" });
    const checked = await asSlack(staffSlack).access.check({
      permissions: ["program:manage", "user:ban"],
      eventId: event.id,
    });
    expect(checked).toMatchObject({
      actor: { id: staff.id, via: "delegated" },
      allowed: { "program:manage": true, "user:ban": false },
    });
    // Staff who aren't on the community still act through their platform role; the audit says it was the bot
    const [logged] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, staff.id), eq(auditLog.action, "tracks.create")));
    expect(logged).toMatchObject({ via: "delegated", byId: bot.id });
  });

  test("only the old Owy bot's key works before the migration, and it can't act for anyone", async () => {
    const legacyStaff = await makeSlackUser({ role: "admin" });
    const [{ key: personal }] = await Promise.all([
      auth.api.createApiKey({ body: { userId: legacyStaff.id, name: "mine" } }),
      db
        .insert(user)
        .values({
          id: "owy-bot",
          name: "Owy",
          email: "owy@owu.uy",
          emailVerified: true,
          role: "admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing(),
    ]);
    const { key: legacy } = await auth.api.createApiKey({ body: { userId: "owy-bot", name: "owy" } });
    const staffSlack = (await db.select().from(account).where(eq(account.userId, legacyStaff.id)))[0].accountId;

    await expect(client({ "x-api-key": personal }).communities.mine()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const checked = await client({ "x-api-key": legacy, "x-owu-actor": `slack:${staffSlack}` }).access.check({
      permissions: ["program:manage", "delegation:act-as"],
    });
    expect(checked).toMatchObject({
      actor: { id: "owy-bot", via: "api-key" },
      allowed: { "program:manage": true, "delegation:act-as": false },
    });
  });

  test("a key without delegation ignores the actor header", async () => {
    const deck = await makeServiceAccount({ id: "deck-no-delegation" });
    const { key } = await mintServiceKey({
      ownerId: deck.id,
      name: "deck",
      permissions: KEY_PRESETS["stream-deck"],
      expiresInDays: 1,
      createdById: null,
    });
    const staff = await makeSiteAdmin();
    const slackId = (await db.select().from(account).where(eq(account.userId, staff.id)))[0].accountId;

    const checked = await client({ "x-api-key": key, "x-owu-actor": `slack:${slackId}` }).access.check({
      permissions: ["program:manage"],
    });
    expect(checked).toMatchObject({ actor: { id: deck.id, via: "api-key" }, allowed: { "program:manage": false } });
  });

  test("Telegram: a person's one-time code lets the bot link their Telegram, then it acts for them", async () => {
    const bot = await makeServiceAccount({ id: "owy-telegram-test" });
    const { key } = await mintServiceKey({
      ownerId: bot.id,
      name: "owy",
      permissions: KEY_PRESETS.owy,
      expiresInDays: 1,
      createdById: null,
    });
    const staff = await makeSiteAdmin({ name: "Tele Staff" });

    const { code } = await call(router.access.telegram.code, undefined, by(staff));
    await expect(
      client({ "x-api-key": key }).access.telegram.link({ code, telegramUserId: "424242" })
    ).resolves.toStrictEqual({
      name: "Tele Staff",
    });
    const checked = await client({ "x-api-key": key, "x-owu-actor": "telegram:424242" }).access.check({
      permissions: ["program:manage"],
    });
    expect(checked.allowed["program:manage"]).toBe(true);
    await expect(
      client({ "x-api-key": key }).access.telegram.link({ code: `${code}x`, telegramUserId: "1" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("the audit log", () => {
  test("changes are recorded with who, how and from where; reads are not", async () => {
    const { community, event } = await makeBoard();
    const editor = await makeMember(community.id, "editor");
    const superadmin = await makePlatformUser("superadmin");
    const cookie = { cookie: await cookieOf(editor.id), "x-forwarded-for": "190.64.1.2" };

    await client(cookie).events.list({ communityId: community.id });
    await client(cookie).staffTasks.create({ eventId: event.id, title: "Armar la puerta", dayDate: "2026-11-07" });

    const entries = await call(router.access.audit, { actorId: editor.id, limit: 10 }, by(superadmin));
    expect(entries.map((entry) => entry.action)).toStrictEqual(["staffTasks.create"]);
    expect(entries[0]).toMatchObject({ via: "session", ip: "190.64.1.2", community: { id: community.id } });
    await expect(call(router.access.audit, { limit: 1 }, by(editor))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("a superadmin who lost the OWU Slack can't view the site as someone else", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(OWU_SLACK_REQUIRED_FROM.getTime() + 1000));
    const [superadmin, person] = await Promise.all([makeUser({ role: "superadmin" }), makeSlackUser()]);
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/admin/impersonate-user`, {
        method: "POST",
        headers: { cookie: await cookieOf(superadmin.id), "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ userId: person.id }),
      })
    );
    vi.useRealTimers();

    expect(response.status).toBe(403);
  });

  test("impersonation is superadmin-only, never over privileged people, and on the record", async () => {
    const [superadmin, staff, person] = await Promise.all([
      makePlatformUser("superadmin"),
      makeSiteAdmin(),
      makeSlackUser(),
    ]);
    const impersonate = async (as: string, target: string) =>
      auth.handler(
        new Request(`${ORIGIN}/api/auth/admin/impersonate-user`, {
          method: "POST",
          headers: { cookie: await cookieOf(as), "content-type": "application/json", origin: ORIGIN },
          body: JSON.stringify({ userId: target }),
        })
      );

    expect((await impersonate(staff.id, person.id)).status).toBe(403);
    expect((await impersonate(superadmin.id, staff.id)).status).toBe(403);
    const started = await impersonate(superadmin.id, person.id);
    expect(started.status).toBe(200);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "user.impersonate"), eq(auditLog.targetId, person.id)));
    expect(entry).toMatchObject({ actorId: superadmin.id });
  });
});
