import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { communityMembers } from "../../src/lib/db/schema";
import { makeCommunity, makeMember, makeSiteAdmin, makeSlackUser } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible } from "./kit";

/** Who gets into a community's panel: its organizers and site staff; everyone else learns why. */
test("organizers and staff open the panel; anyone else signed in sees why, and the anonymous log in", async ({
  pageFor,
  pageAs,
}) => {
  const community = await makeCommunity({ name: `Comunidad con puerta ${Date.now().toString(36)}` });
  const panel = `/organizar/panel/${community.slug}`;
  const [owner, admin, editor, staff] = await Promise.all([
    makeMember(community.id, "owner"),
    makeMember(community.id, "admin"),
    makeMember(community.id, "editor"),
    makeSiteAdmin(),
  ]);

  for (const user of [owner, admin, editor, staff]) {
    const page = await pageFor(user);
    await page.goto(`${panel}/calendario`);
    await expect(page.getByRole("heading", { level: 1, name: "Calendario" })).toBeVisible();
    await page.close();
  }

  const anonymous = await pageAs("anonymous");
  await anonymous.goto(`${panel}/eventos`);
  await expect(anonymous).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(`${panel}/eventos`)}`));

  // A community that doesn't exist is still a 404
  const lost = await pageFor(editor);
  const response = await lost.goto("/organizar/panel/no-existe-esta-comunidad");
  expect(response?.status()).toBe(404);
});

test("a member who helps at the door sees their role, the admins who show up, and asks for access", async ({
  pageFor,
}) => {
  const community = await makeCommunity({ name: `Comunidad de la puerta ${Date.now().toString(36)}` });
  const [shown, hidden, member, door] = await Promise.all([
    makeMember(community.id, "admin", { name: "Admina Visible" }),
    makeMember(community.id, "owner", { name: "Dueño Reservado" }),
    makeMember(community.id, "member", { name: "Miembro Puerta" }),
    makeMember(community.id, "door"),
  ]);
  await db.update(communityMembers).set({ showOnProfile: true }).where(eq(communityMembers.userId, shown.id));

  const page = await pageFor(member);
  await page.goto(`/organizar/panel/${community.slug}/eventos`);
  await expect(page.getByRole("heading", { level: 1, name: `No tenés acceso a ${community.name}` })).toBeVisible();
  await expect(page.getByText(/Sos Miembro de/)).toBeVisible();
  await expect(page.getByText("La administran Admina Visible.")).toBeVisible();
  await expect(page.getByText(hidden.name)).toHaveCount(0);
  await expectAccessible(page);

  await page.getByRole("textbox", { name: /Contales para qué/ }).fill("Quiero ayudar a organizar");
  await page.getByRole("button", { name: "Pedir acceso" }).click();
  await expect(page.getByRole("status")).toContainText("Pediste acceso");
  // It stays asked after a reload
  await page.reload();
  await expect(page.getByText(/Pediste acceso/)).toBeVisible();

  const volunteer = await pageFor(door);
  await volunteer.goto(`/organizar/panel/${community.slug}`);
  await expect(volunteer.getByText(/Sos Puerta de/)).toBeVisible();

  const stranger = await pageFor(await makeSlackUser({ name: "Persona Curiosa" }));
  await stranger.goto(`/organizar/panel/${community.slug}`);
  await expect(stranger.getByText(`Todavía no sos parte del equipo de ${community.name}.`)).toBeVisible();
  await expect(stranger.getByRole("button", { name: "Pedir acceso" })).toBeVisible();
});
