import { db } from "../../src/lib/db";
import { communityAssets } from "../../src/lib/db/schema";
import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, makeOrganizer } from "./kit";

test("the last owner can't leave, and a one-person team is told to add someone", async ({ pageFor }) => {
  const { organizer, panel } = await makeOrganizer("owner");

  const page = await pageFor(organizer);
  await page.goto(`${panel}/equipo`);

  // Off before any confirm, with the reason on the row
  await expect(page.locator("#salir").getByRole("button", { name: "Salir" })).toBeDisabled();
  await expect(page.getByText("Pasá la propiedad a otra persona primero", { exact: false })).toBeVisible();

  await expect(page.getByText("Si alguien deja, la comunidad se frena: sumá a otra persona.")).toBeVisible();
  await page.getByRole("button", { name: "Sumar a alguien" }).click();
  await expect(page.getByLabel("Email o nombre en el Slack de OWU")).toBeFocused();
  // The panel's shell (sidebar, switcher) has its own axe specs
  await expectAccessible(page, { include: "main" });
});

test("a second owner hands over: who stays, the accounts to pass on, then out", async ({ pageFor }) => {
  const { community, panel } = await makeOrganizer("owner");
  const second = await makeMember(community.id, "owner", { name: "Segunda Dueña" });
  await db
    .insert(communityAssets)
    .values({ communityId: community.id, platform: "meetup", label: "meetup.com/prueba", holderUserId: second.id });

  const page = await pageFor(second);
  await page.goto(`${panel}/equipo`);
  await page.locator("#salir").getByRole("button", { name: "Salir" }).click();
  const sheet = page.getByRole("dialog", { name: `Salir de ${community.name}` });
  await expect(sheet.getByText("Paso 1 de 3: ¿Quién sigue?")).toBeVisible();
  await sheet.getByRole("radio", { name: /Ya queda quien siga/ }).click();
  await sheet.getByRole("button", { name: "Siguiente" }).click();

  await expect(sheet.getByText("La tenés vos")).toBeVisible();
  await sheet.getByRole("checkbox", { name: /Ya le pasé el acceso: Meetup/ }).click();
  await expect(sheet.getByText("1 de 1 marcadas", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Siguiente" }).click();
  await sheet.getByRole("button", { name: "Salir del equipo" }).click();

  await expect(page).toHaveURL(/\/organizar\/panel/);
  await expect(page).not.toHaveURL(new RegExp(community.slug));
  // Equipo isn't theirs any more
  await page.goto(`${panel}/equipo`);
  await expect(page.locator("#salir")).toHaveCount(0);
});

test("admins keep the community's accounts in Equipo; editors don't see them", async ({ pageFor }) => {
  const { community, organizer: admin, panel } = await makeOrganizer("admin");
  const editor = await makeMember(community.id, "editor", { name: "Editora Curiosa" });

  const page = await pageFor(admin);
  await page.goto(`${panel}/equipo`);
  const accounts = page.locator("#cuentas");
  await expect(accounts.getByText("Todavía no anotaron cuentas")).toBeVisible();
  await expect(accounts.getByText("Nunca guardes contraseñas acá", { exact: false })).toBeVisible();
  await accounts.getByRole("button", { name: "Sumar una cuenta" }).click();
  const sheet = page.getByRole("dialog", { name: "Sumar una cuenta" });
  await sheet.getByRole("combobox", { name: "Plataforma" }).click();
  await page.getByRole("option", { name: "Instagram" }).click();
  await sheet.getByLabel("Usuario o link").fill("@comunidadprueba");
  await sheet.getByRole("combobox", { name: "Quién la tiene" }).click();
  await page.getByRole("option", { name: "Organizadora de Prueba" }).click();
  await sheet.getByRole("button", { name: "Guardar" }).click();

  await expect(accounts.getByText("Instagram · @comunidadprueba")).toBeVisible();
  await expect(accounts.getByText("La tiene Organizadora de Prueba · sin respaldo")).toBeVisible();
  // The panel's shell (sidebar, switcher) has its own axe specs
  await expectAccessible(page, { include: "main" });

  const asEditor = await pageFor(editor);
  await asEditor.goto(`${panel}/equipo`);
  await expect(asEditor.getByText("Solo quienes administran la comunidad", { exact: false })).toBeVisible();
  await expect(asEditor.locator("#cuentas")).toHaveCount(0);
  // Anyone but the last owner can start leaving
  await expect(asEditor.locator("#salir").getByRole("button", { name: "Salir" })).toBeEnabled();
});
