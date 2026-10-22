import { expect, test } from "../fixtures";

const OBS_PORT = Number(process.env.E2E_OBS_PORT ?? 4466);

test("Enter on a focused scene card puts it in preview, without taking it to air", async ({ page }) => {
  await page.goto(`/admin/screen?connect=127.0.0.1:${OBS_PORT}`);
  const onAir = page.locator("[role=button][aria-label$=', al aire']");
  await expect(onAir).toHaveCount(1);
  const studio = page.getByRole("switch").first();
  if ((await studio.getAttribute("aria-checked")) !== "true") await studio.click();
  await expect(page.locator("[role=button][aria-label$=', en preview']")).toHaveCount(1);
  const program = await onAir.getAttribute("aria-label");
  // The mock OBS is shared: pick a scene that is neither on air nor in preview.
  let idle = "";
  for (const name of ["Speaker full", "Slides full", "Break", "Outro", "Sponsors"]) {
    if ((await page.getByRole("button", { name, exact: true }).count()) === 1) {
      idle = name;
      break;
    }
  }

  await page.getByRole("button", { name: idle, exact: true }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: `${idle}, en preview` })).toBeVisible();
  // A TAKE riding on the same key would land a moment later: give it that moment, then look again.
  await page.waitForTimeout(1000);
  await expect(page.getByRole("button", { name: `${idle}, en preview` })).toBeVisible();
  await expect(page.getByRole("button", { name: program ?? "" })).toBeVisible();
});
