import { makeCommunity, makeMember, makePlatformUser, makeSlackUser, makeUser } from "../../src/test/factories";
import { expect, test } from "../fixtures";

test("someone without a role asks to join a community's team; its admin approves; they get in", async ({ pageFor }) => {
  const community = await makeCommunity({ name: `Rust MVD ${Date.now()}` });
  await makeMember(community.id, "owner");
  const [admin, volunteer] = await Promise.all([
    makeMember(community.id, "admin", { name: "Admin Rust" }),
    makeSlackUser({ name: "Voluntaria Nueva" }),
  ]);

  // No role yet: the dashboard sends them to ask for access
  const asking = await pageFor(volunteer);
  await asking.goto("/admin");
  await expect(asking).toHaveURL(/\/acceso$/);
  await asking.getByRole("combobox", { name: "A qué querés acceso" }).click();
  await asking.getByRole("option", { name: community.name }).click();
  await asking.getByRole("textbox", { name: "Mensaje (opcional)" }).fill("Ayudo en la puerta");
  await asking.getByRole("button", { name: "Pedir acceso" }).click();
  await expect(asking.getByText("Pendiente")).toBeVisible();

  // The community's admin approves it from Equipo
  const deciding = await pageFor(admin);
  await deciding.goto(`/organizar/panel/${community.slug}/equipo`);
  await expect(deciding.getByText(/Pedidos para sumarse/)).toBeVisible();
  await deciding.getByRole("button", { name: "Aprobar" }).click();
  await expect(deciding.getByText("Pedido aprobado")).toBeVisible();

  // Now they have a role: the dashboard lets them in
  await asking.goto("/admin");
  await expect(asking).not.toHaveURL(/\/acceso$/);
});

test("a moderator suspends someone from Acceso and their session stops working at once", async ({ pageFor }) => {
  const [moderator, person] = await Promise.all([
    makePlatformUser("moderator", { name: "Moderadora" }),
    makeSlackUser({ name: `Persona Suspendible ${Date.now()}` }),
  ]);
  const community = await makeCommunity();
  await makeMember(community.id, "owner");
  const theirs = await pageFor(person);
  await theirs.goto("/acceso");
  // Their access, loaded (the skeleton's "Acceso" heading matched only until it was)
  await expect(theirs.getByRole("heading", { level: 1, name: "Pedí acceso" })).toBeVisible();

  const page = await pageFor(moderator);
  await page.goto("/admin/acceso?tab=personas");
  await page.getByLabel("Buscar por nombre o email").fill(person.name);
  await page.getByRole("button", { name: person.name }).click();
  await page.getByRole("textbox", { name: "Motivo" }).fill("Spam en el Slack");
  await page.getByRole("button", { name: "Suspender" }).click();
  await expect(page.getByText("Suspendida").first()).toBeVisible();

  await theirs.reload();
  await expect(theirs).toHaveURL(/\/login/);
});

test("Acceso is only for people who manage access; community staff don't see it", async ({ pageFor }) => {
  const community = await makeCommunity();
  const [editor, moderator] = await Promise.all([makeMember(community.id, "editor"), makePlatformUser("moderator")]);

  const asEditor = await pageFor(editor);
  await asEditor.goto("/admin/acceso");
  await expect(asEditor).not.toHaveURL(/\/admin\/acceso/);

  const asModerator = await pageFor(moderator);
  await asModerator.goto("/admin/acceso");
  await expect(asModerator.getByRole("heading", { level: 1, name: "Acceso" })).toBeVisible();
});

test("someone with no role at all never sees the dashboard", async ({ pageFor }) => {
  const page = await pageFor(await makeUser({ name: "Sin Rol" }));

  for (const path of ["/admin", "/admin/communities", "/admin/acceso"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/acceso$/);
  }
});
