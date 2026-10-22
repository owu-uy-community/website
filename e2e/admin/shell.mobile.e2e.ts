import { expect, test } from "../fixtures";

test("on a phone the tab bar is solid, and a settings save bar sits above it", async ({ page, board }) => {
  await page.goto(`/admin/communities/${board.community.slug}`);
  const tabs = page.getByRole("navigation", { name: "Secciones" });
  await expect(tabs).toBeVisible();
  // Translucent bars let the page's text show through wherever the blur isn't painted.
  expect(await tabs.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toMatch(/\/ 0\.|rgba/);

  await page.locator("#community-name").fill(`${board.community.name} editada`);
  const bar = page.getByRole("region", { name: "Cambios sin guardar" });
  await expect(bar).toBeVisible();
  const [barBox, tabsBox] = [(await bar.boundingBox())!, (await tabs.boundingBox())!];
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(tabsBox.y);

  // "Más" opens the whole menu. (A dispatched click: in dev the query devtools' button covers that corner.)
  await tabs.getByRole("button", { name: "Más" }).dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "Menú" }).getByRole("link", { name: "Ajustes" })).toBeVisible();
});
