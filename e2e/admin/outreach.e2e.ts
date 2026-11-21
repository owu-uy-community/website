import { makeCommunity, makeEvent, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, lastEmailTo } from "../organizar/kit";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

test("staff write to a dormant community's team, then mark it done (and can undo)", async ({ page, request }) => {
  const community = await makeCommunity({ name: `Comunidad dormida ${Date.now().toString(36)}`, createdAt: ago(1000) });
  const owner = await makeMember(community.id, "owner", { name: "Dueña Dormida" });
  await makeEvent(community.id, { status: "published", startDate: ago(200.1), endDate: ago(200) });

  // The default page is site staff
  await page.goto("/admin/una-mano");
  await expect(page.getByRole("heading", { level: 1, name: "Comunidades que necesitan una mano" })).toBeVisible();
  // Its two rows (dormant, nobody active): the one with the «Dormida» badge
  const row = page
    .getByRole("listitem")
    .filter({ hasText: community.name })
    .filter({ has: page.getByText("Dormida", { exact: true }) });
  await expect(row).toContainText("Hace 200 días del último evento, y nada en agenda");
  await expect(row.getByRole("list", { name: `Equipo de ${community.name}` })).toContainText("Dueña Dormida");
  // The admin shell has its own axe specs
  await expectAccessible(page, { include: "main" });

  await row.getByRole("button", { name: "Escribirle al equipo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Escribir a 1 persona" }).click();
  await expect(page.getByText("Le escribimos a 1 persona")).toBeVisible();
  const mail = await lastEmailTo(request, owner.email, `¿Siguen con ${community.name}?`);
  expect(mail.text).toContain("del equipo de OWU");
  await expect(row).toContainText("Les escribieron");

  await row.getByRole("button", { name: "Hecho" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(row).toHaveCount(1);
});
