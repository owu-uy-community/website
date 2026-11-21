import { expect, test } from "../fixtures";
import { expectAccessible, makeOrganizer } from "./kit";

test("an admin sets the community's usual day and a pause with a return date", async ({ pageFor }) => {
  const { organizer, panel } = await makeOrganizer("admin");
  const page = await pageFor(organizer);
  await page.goto(`${panel}/perfil`);
  await expectAccessible(page);

  const usual = page.getByRole("region", { name: "Nuestro día" });
  await usual.getByRole("combobox", { name: "Día de la semana" }).click();
  await page.getByRole("option", { name: "jueves" }).click();
  await usual.getByRole("combobox", { name: "Qué semana del mes" }).click();
  await page.getByRole("option", { name: "2.º" }).click();
  await usual.getByRole("textbox", { name: "Hora de inicio" }).fill("19:30");

  await page.getByRole("combobox", { name: "Estado" }).click();
  await page.getByRole("option", { name: /En pausa/ }).click();
  await page.getByLabel("Volvemos el (opcional)").fill("2029-03-01");

  await page.getByRole("button", { name: /^Guardar/ }).click();
  await expect(page.getByText("Perfil guardado")).toBeVisible();

  await page.reload();
  await expect(usual.getByRole("combobox", { name: "Día de la semana" })).toHaveText("jueves");
  await expect(usual.getByRole("combobox", { name: "Qué semana del mes" })).toHaveText("2.º");
  await expect(usual.getByRole("textbox", { name: "Hora de inicio" })).toHaveValue("19:30");
  await expect(page.getByLabel("Volvemos el (opcional)")).toHaveValue("2029-03-01");
});

test("editors read the profile; the Slack placeholder is the community's own", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("editor");
  const page = await pageFor(organizer);
  await page.goto(`${panel}/perfil`);

  await expect(page.getByText("Solo los admins de la comunidad cambian el perfil.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Canal de Slack" })).toHaveAttribute("placeholder", community.slug);
  await expect(page.getByRole("button", { name: /^Guardar/ })).toHaveCount(0);
});

test("/organizar walks the panel and sends 'Sumá tu comunidad' to the proposal form", async ({ pageAs }) => {
  const page = await pageAs("anonymous");
  await page.goto("/organizar");

  await expect(page.getByRole("heading", { name: "De la fecha a la puerta, en un solo lugar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sumá tu comunidad" }).first()).toHaveAttribute(
    "href",
    /\/organizar\/panel\/reclamar\?proponer/
  );
  await expect(page.getByText(/canvas/)).toHaveCount(0);
  await expectAccessible(page);
});
