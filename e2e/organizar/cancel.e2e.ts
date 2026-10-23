import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, lastEmailTo, makeOrganizer, makePublishedEvent, makeRegistrations, runTick } from "./kit";

test("cancelling asks why, says how many hear about it, can go back; people and the page get the reason", async ({
  page,
  pageFor,
  request,
}) => {
  const { community } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin");
  const event = await makePublishedEvent(community.id);
  const [ana] = await makeRegistrations(event.id, 1);
  await makeRegistrations(event.id, 1, { status: "waitlisted" });
  const reason = "Se suspende por el paro de transporte. Lo pasamos al jueves que viene.";

  const panel = await pageFor(admin);
  await panel.goto(`/organizar/panel/${community.slug}/eventos/${event.id}?tab=ajustes`);
  await panel.getByRole("button", { name: "Cancelar evento" }).click();
  const dialog = panel.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Cancelar y avisar a 2 personas" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(dialog).toBeHidden();

  await panel.getByRole("button", { name: "Cancelar evento" }).click();
  await dialog.getByLabel("Por qué se cancela").fill(reason);
  await confirm.click();
  await expect(panel.getByText("Este evento está cancelado: ya no se edita.")).toBeVisible();

  await runTick(request);
  const notice = await lastEmailTo(request, ana.email, `Se canceló ${event.name}`);
  expect(notice.text).toContain(`Por qué: ${reason}`);

  await page.goto(`/comunidad/${community.slug}/events/${event.slug}`);
  await expect(page.getByTestId("cancel-reason")).toHaveText(reason);
  await expectAccessible(page, { include: "main" });
});
