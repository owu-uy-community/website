import { db } from "../../src/lib/db";
import { incidentNotes, incidents } from "../../src/lib/db/schema";
import { expect, test } from "../fixtures";

// The member works from a phone; the admin moves to a desktop screen below.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("a room host reports from the phone and an organizer resolves it", async ({ page, pageAs, tenant }) => {
  const scope = `/admin/${tenant.community.slug}`;
  const event = `event=${tenant.event.slug}`;
  const title = "El micrófono inalámbrico no anda";

  const host = await pageAs("member");
  await host.goto(`${scope}/sala?${event}`);
  await expect(host.getByRole("radio", { name: "Abierta" })).toBeVisible();
  await host.getByRole("button", { name: "Reportar" }).click();

  const form = host.getByRole("dialog", { name: "Reportar un incidente" });
  // The host's room comes filled in.
  await expect(form.getByRole("combobox", { name: "Sala" })).toHaveText(tenant.rooms.plain.name);
  await form.getByLabel("En pocas palabras").fill(title);
  await form.getByRole("radio", { name: "Técnica" }).click();
  await form.getByRole("button", { name: "Reportar" }).click();
  await expect(form).toBeHidden();
  const card = host.getByRole("link", { name: new RegExp(title) });
  await expect(card).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${scope}/incidentes?${event}`);
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const detail = page.getByRole("complementary");
  await expect(detail.getByText("desde un teléfono").first()).toBeVisible();
  await detail.getByRole("radio", { name: "Resuelto" }).click();
  await expect(detail.getByText("cambió el estado a resuelto")).toBeVisible();

  // The host's phone hears it: the room has nothing open anymore.
  await expect(card).toBeHidden();
});

test("an incident's title and a typed note are fixed, and then the incident is deleted", async ({
  page,
  board,
  tenant,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const [incident] = await db
    .insert(incidents)
    .values({ eventId: board.event.id, title: "Proyector sin señal", category: "technical" })
    .returning({ id: incidents.id });
  await db
    .insert(incidentNotes)
    .values({ incidentId: incident.id, authorId: tenant.users.admin.id, body: "Voy con un adaptador", kind: "note" });
  await page.goto(`/admin/${board.community.slug}/incidentes?event=${board.event.slug}&incidente=${incident.id}`);
  const detail = page.getByRole("complementary");

  await detail.getByRole("button", { name: "Editar el incidente" }).click();
  const form = page.getByRole("dialog", { name: "Editar incidente" });
  await form.getByLabel("En pocas palabras").fill("Proyector roto");
  await form.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(form).toBeHidden();
  await expect(detail.getByText("cambió el título a «Proyector roto»")).toBeVisible();

  await detail.getByRole("button", { name: "Más acciones de la nota" }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  // While it's being fixed the note has no menu: its field is the one to find.
  await detail.getByRole("textbox", { name: "Corregir la nota" }).fill("Voy con un adaptador HDMI");
  await detail.getByRole("button", { name: "Guardar", exact: true }).click();
  const note = detail.getByRole("listitem").filter({ hasText: "Voy con un adaptador HDMI" });
  await expect(note).toContainText("editado");

  await detail.getByRole("button", { name: "Editar el incidente" }).click();
  await form.getByRole("button", { name: "Borrar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Borrar incidente" }).click();

  await expect(page.getByRole("button", { name: /Proyector roto/ })).toBeHidden();
});
