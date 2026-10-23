import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, HOUR, makeOrganizer, makePublishedEvent, makeRegistrations } from "./kit";

test("every section of an event and every step of its wizard passes axe, old tab links included", async ({
  pageFor,
}) => {
  test.slow();
  const { community, panel } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin");
  const event = await makePublishedEvent(community.id, { volunteerRoles: ["puerta"] });
  await makeRegistrations(event.id, 4, { volunteerRoles: ["puerta"] });
  const past = await makePublishedEvent(community.id, { startsIn: -6 * HOUR });
  await makeRegistrations(past.id, 3, { checkedIn: 2 });
  const page = await pageFor(admin);
  const nav = page.getByRole("navigation", { name: "Secciones del evento" });

  // Links from before the sections were renamed still land where they meant
  await page.goto(`${panel}/eventos/${event.id}?tab=resumen`);
  await expect(nav.getByRole("button", { name: "Hoy" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Antes del evento" })).toBeVisible();
  await expectAccessible(page);
  for (const [tab, section] of [
    ["inscriptos", "Personas"],
    ["emails", "Mensajes"],
    ["publicaciones", "Difusión"],
    ["feedback", "Después"],
    ["ajustes", "Ajustes"],
  ] as const) {
    await page.goto(`${panel}/eventos/${event.id}?tab=${tab}`);
    await expect(nav.getByRole("button", { name: section })).toHaveAttribute("aria-current", "page");
    await expectAccessible(page);
  }
  await page.goto(`${panel}/eventos/${event.id}?tab=puerta`);
  await expect(page.getByRole("button", { name: "Crear el link" })).toBeVisible();
  await expectAccessible(page);

  // A row of the list opens its section in place, with the field in focus
  await page.goto(`${panel}/eventos/${event.id}`);
  await page.getByRole("link", { name: /Recordatorio con nota/ }).click();
  await expect(page.getByLabel(/^Nota en los recordatorios/)).toBeFocused();

  for (const step of ["tipo", "datos", "fecha", "espacio", "inscripcion", "difusion", "revisar"]) {
    await page.goto(`${panel}/eventos/${event.id}/editar?paso=${step}`);
    await expect(page.getByTestId("published-banner")).toBeVisible();
    await expectAccessible(page);
  }

  await page.goto(`${panel}/eventos/${past.id}`);
  await expect(page.getByText("1 · Quién vino")).toBeVisible();
  await expectAccessible(page);
});
