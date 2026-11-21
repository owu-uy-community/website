import { makeCommunity, makeSlackUser } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, failNext, lastEmailTo } from "./kit";

test("a community that isn't in OWU is proposed, staff approve it in /admin, and its panel opens", async ({
  page,
  pageFor,
}) => {
  const name = `Elixir Uruguay ${Date.now().toString(36)}`;
  const organizer = await makeSlackUser({ name: "Organizadora Nueva" });

  const mine = await pageFor(organizer);
  await mine.goto("/organizar/panel");
  await expect(mine).toHaveURL(/\/organizar\/panel\/reclamar$/);
  await expectAccessible(mine);
  await mine.getByRole("textbox", { name: "Buscar comunidad" }).fill(name);
  await expect(mine.getByText("No está en la lista")).toBeVisible();
  await mine.getByRole("button", { name: "Proponé tu comunidad" }).click();

  const form = mine.locator("form").filter({ has: mine.getByRole("button", { name: "Enviar la propuesta" }) });
  await expect(form.getByRole("textbox", { name: "Nombre" })).toHaveValue(name);
  await form.getByRole("textbox", { name: "Link principal" }).fill("https://www.meetup.com/elixir-uy");
  await form.getByRole("button", { name: "Lenguajes" }).click();
  await expect(form.getByRole("button", { name: "Lenguajes" })).toHaveAttribute("aria-pressed", "true");
  await form.getByRole("button", { name: "Enviar la propuesta" }).click();
  await expect(mine.getByText("Propuesta enviada")).toBeVisible();
  // "Tus pedidos" lists it, waiting for staff
  await expect(mine.getByRole("listitem").filter({ hasText: name }).getByText("En revisión")).toBeVisible();

  // Site staff (the default page) approve it as a new community
  await page.goto("/admin/communities");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row.getByText("Nueva comunidad")).toBeVisible();
  await row.getByRole("button", { name: "Aprobar y sumarla" }).click();
  await expect(page.getByText("Aprobado como dueño")).toBeVisible();
  await lastEmailTo(page.request, organizer.email, `Ya organizás ${name} en OWU`);

  // The panel opens on it, with its first steps
  await mine.goto("/organizar/panel");
  await expect(mine.getByRole("heading", { level: 1, name: "Inicio" })).toBeVisible();
  await expect(mine.getByRole("region", { name: "Primeros pasos" })).toContainText("de 4 listos");
  await expect(mine.getByText(`Lo que ${name} tiene en marcha`, { exact: false })).toBeVisible();
});

test("a name OWU already has points to it instead of proposing a copy", async ({ pageFor }) => {
  const listed = await makeCommunity({ name: `Kotlin Montevideo ${Date.now().toString(36)}`, listed: true });
  const page = await pageFor(await makeSlackUser());

  await page.goto("/organizar/panel/reclamar?proponer");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Enviar la propuesta" }) });
  await form.getByRole("textbox", { name: "Nombre" }).fill(listed.name.toLowerCase());
  await form.getByRole("textbox", { name: "Link principal" }).fill("https://kotlin.uy");
  await form.getByRole("button", { name: "Enviar la propuesta" }).click();
  await expect(page.getByText(`${listed.name} ya está en OWU`)).toBeVisible();
});

test("a proposal that fails says so and keeps what was typed", async ({ pageFor }) => {
  const page = await pageFor(await makeSlackUser());
  await page.goto("/organizar/panel/reclamar?proponer");
  await failNext(page, "communities.propose");

  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Enviar la propuesta" }) });
  await form.getByRole("textbox", { name: "Nombre" }).fill("Comunidad que no llega");
  await form.getByRole("textbox", { name: "Link principal" }).fill("https://ejemplo.uy");
  await form.getByRole("button", { name: "Enviar la propuesta" }).click();
  await expect(page.getByText("No se pudo enviar la propuesta")).toBeVisible();
  await expect(form.getByRole("textbox", { name: "Nombre" })).toHaveValue("Comunidad que no llega");
});
