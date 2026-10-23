import { call } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeMember, makeSiteAdmin, makeUser } from "test/factories";

async function setup() {
  const community = await makeCommunity();
  const [owner, admin, editor] = await Promise.all([
    makeMember(community.id, "owner", { name: "Dueña Uno" }),
    makeMember(community.id, "admin", { name: "Admin Dos" }),
    makeMember(community.id, "editor"),
  ]);

  return { community, owner, admin, editor };
}

describe("Cuentas y accesos", () => {
  test("admins add, change and remove the community's accounts, with who holds each", async () => {
    const { community, owner, admin } = await setup();
    const input = { communityId: community.id };

    const meetup = await call(
      router.assets.save,
      {
        ...input,
        platform: "meetup",
        label: "meetup.com/comunidad-de-prueba",
        holderUserId: owner.id,
        backupUserId: admin.id,
        note: "La cuenta es la del mail de la comunidad",
      },
      by(admin)
    );
    expect(meetup).toMatchObject({
      platform: "meetup",
      holder: { userId: owner.id, name: "Dueña Uno" },
      backup: { userId: admin.id, name: "Admin Dos" },
    });
    // Someone outside the team holds the Instagram: a name is enough
    await call(router.assets.save, { ...input, platform: "instagram", holderName: "Ex organizadora" }, by(owner));
    await call(router.assets.save, { ...input, id: meetup.id, platform: "meetup", holderUserId: admin.id }, by(owner));

    await expect(call(router.assets.list, input, by(owner))).resolves.toMatchObject([
      { platform: "instagram", holder: { userId: null, name: "Ex organizadora" }, backup: null },
      { platform: "meetup", holder: { userId: admin.id, name: "Admin Dos" }, backup: null, note: "" },
    ]);

    await call(router.assets.remove, { ...input, id: meetup.id }, by(admin));
    await expect(call(router.assets.list, input, by(admin))).resolves.toHaveLength(1);
  });

  test("editors can't read them, and another community's admin can't touch them", async () => {
    const { community, admin, editor } = await setup();
    const other = await setup();
    const asset = await call(
      router.assets.save,
      { communityId: community.id, platform: "slack", label: "#comunidad" },
      by(admin)
    );

    await expect(call(router.assets.list, { communityId: community.id }, by(editor))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      call(router.assets.save, { communityId: community.id, platform: "x" }, by(editor))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.assets.list, { communityId: community.id }, by(other.admin))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // Site staff read any
    await expect(
      call(router.assets.list, { communityId: community.id }, by(await makeSiteAdmin()))
    ).resolves.toHaveLength(1);
  });

  test("an admin naming their own community can't reach another's account by id", async () => {
    const { community, admin } = await setup();
    const other = await setup();
    const asset = await call(router.assets.save, { communityId: community.id, platform: "slack" }, by(admin));

    // Its own community in the input, someone else's account by id: not found
    await expect(
      call(router.assets.remove, { communityId: other.community.id, id: asset.id }, by(other.admin))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(router.assets.save, { communityId: other.community.id, id: asset.id, platform: "x" }, by(other.admin))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("anyone on the team sees the accounts they hold or back up; strangers don't", async () => {
    const { community, owner, admin, editor } = await setup();
    const input = { communityId: community.id };
    await call(router.assets.save, { ...input, platform: "meetup", holderUserId: editor.id }, by(admin));
    await call(
      router.assets.save,
      { ...input, platform: "x", holderUserId: owner.id, backupUserId: editor.id },
      by(admin)
    );
    await call(router.assets.save, { ...input, platform: "youtube", holderUserId: owner.id }, by(admin));

    const held = await call(router.assets.mine, input, by(editor));
    expect(held.map((asset) => asset.platform)).toStrictEqual(["meetup", "x"]);
    await expect(call(router.assets.mine, input, by(await makeUser()))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("holders must be on the team, and passwords are refused", async () => {
    const { community, admin } = await setup();
    const stranger = await makeUser();

    await expect(
      call(router.assets.save, { communityId: community.id, platform: "x", holderUserId: stranger.id }, by(admin))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(router.assets.save, { communityId: community.id, platform: "x", note: "clave: hunter2" }, by(admin))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("leaving the team", () => {
  test("the last owner can't leave; with a second owner, either one can", async () => {
    const { community, owner } = await setup();
    const input = { communityId: community.id };

    await expect(call(router.communities.members.leave, input, by(owner))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "last_owner" },
    });

    const second = await makeMember(community.id, "owner");
    await expect(call(router.communities.members.leave, input, by(owner))).resolves.toStrictEqual({ success: true });
    await expect(call(router.communities.members.leave, input, by(second))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("an admin leaving can mark that the community looks for organizers", async () => {
    const { community, admin } = await setup();

    await expect(
      call(router.communities.update, { communityId: community.id, data: { status: "busca-organizadores" } }, by(admin))
    ).resolves.toMatchObject({ status: "busca-organizadores" });
  });
});
