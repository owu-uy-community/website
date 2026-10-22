import type { Locator, Page } from "@playwright/test";

/**
 * A finger sliding sideways across what's on screen of `target`, as real touch events (Chromium, through CDP),
 * so the browser runs its own touch → pointer → scroll logic. Starts and ends inside the target, away from the
 * screen's edges (Safari's back gesture lives there).
 */
export async function swipe(page: Page, target: Locator, direction: "left" | "right") {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const viewport = page.viewportSize()!;
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, viewport.height);
  const y = (top + bottom) / 2;
  const [x0, x1] = [box.x + box.width * 0.2, box.x + box.width * 0.8];
  const [from, to] = direction === "left" ? [x1, x0] : [x0, x1];

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from + ((to - from) * step) / 10, y }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
