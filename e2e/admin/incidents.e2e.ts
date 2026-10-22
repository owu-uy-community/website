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
