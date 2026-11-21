import { makeEvent } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, makeOrganizer, makePublishedEvent, makeRegistrations } from "./kit";

test("on a phone, Para hacer comes right after the next event, within a screen and a half", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("editor");
  const next = await makePublishedEvent(community.id, { name: "El próximo", startsIn: 9 * DAY });
  await makeRegistrations(next.id, 30);
  await makeEvent(community.id, { name: "Borrador sin fecha", status: "draft" });
  const page = await pageFor(organizer);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(panel);

  const todo = page.getByRole("region", { name: "Para hacer" }).filter({ visible: true });
  await expect(todo.getByText("«Borrador sin fecha» no tiene fecha")).toBeVisible();
  const [event, list] = await Promise.all([
    page.getByRole("region", { name: "Próximo evento" }).boundingBox(),
    todo.boundingBox(),
  ]);
  const height = page.viewportSize()?.height ?? 0;

  expect(event && list && event.y < list.y).toBe(true);
  expect((list?.y ?? Infinity) + 44).toBeLessThan(height * 1.5);
});
