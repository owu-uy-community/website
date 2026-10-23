import type { Page } from "@playwright/test";

import { SOUNDS } from "../../src/lib/launchpad/sounds";
import { expect, test } from "../fixtures";

// Every tab on the launchpad channel hears every other one: these take turns.
test.describe.configure({ mode: "serial" });

/** The launchpad as an output or a controller, once the hub confirms its subscription. */
async function open(page: Page, mode: "output" | "controller") {
  await page.addInitScript((output) => {
    localStorage.setItem("launchpad-output-mode", String(output));
    // `next dev` floats its issue badge over the bottom-left corner.
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  }, mode === "output");
  // Listen from the socket's first frame on (the ack can beat a later listener). Under
  // `next dev` one socket is HMR's; the realtime one is the other.
  const subscribed = new Promise<void>((resolve) => {
    page.on("websocket", (ws) => {
      if (ws.url().includes("/_next/")) return;
      ws.on("framereceived", (frame) => {
        if (String(frame.payload).includes('"ch":"launchpad-sounds"')) resolve();
      });
    });
  });
  await page.goto("/admin/launchpad");
  await subscribed;

  if (mode === "output") {
    // The tap a browser wants before a page may sound, then the whole bank decoded.
    await page.getByRole("heading", { name: "Sonidos", exact: true }).click();
    await expect(page.getByText(`${SOUNDS.length} sonidos listos`)).toBeVisible();
  }

  return page;
}

test("a controller's press plays on the output, both show it, and Detener todo stops it", async ({ page, pageAs }) => {
  const output = await open(await pageAs("admin"), "output");
  const controller = await open(page, "controller");
  await expect(controller.getByText("Ninguna salida: no se va a escuchar")).toBeHidden();

  await controller.getByRole("button", { name: "Disparar Aplausos en las salidas" }).click();

  await expect(output.getByRole("button", { name: "Reproducir Aplausos" })).toHaveAttribute("aria-pressed", "true");
  // Confirmed by the output, not assumed: the controller lights the pad when the output says it plays.
  await expect(controller.getByRole("button", { name: "Disparar Aplausos en las salidas" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(controller.getByRole("region", { name: "Ahora suena" })).toContainText("Aplausos");

  await controller.getByRole("button", { name: /^Detener todo/ }).click();

  await expect(output.getByRole("button", { name: "Reproducir Aplausos" })).toHaveAttribute("aria-pressed", "false");
  await expect(controller.getByRole("region", { name: "Ahora suena" })).toBeHidden();
});

test("on the output itself a pad plays at once, and the same pad again cuts it", async ({ page }) => {
  const output = await open(page, "output");
  const pad = output.getByRole("button", { name: "Reproducir Bocina" });

  // A mouse fires on press: the click that follows must not count as a second press (a stop).
  await pad.click();
  await expect(pad).toHaveAttribute("aria-pressed", "true");
  await expect(output.getByRole("region", { name: "Ahora suena" })).toContainText("Bocina");

  await pad.click();
  await expect(pad).toHaveAttribute("aria-pressed", "false");
});

test("keys 1–9 fire the first pads on screen, 0 stops, and a muted output plays nothing", async ({ page, pageAs }) => {
  const output = await open(page, "output");
  const first = output.getByRole("button", { name: `Reproducir ${SOUNDS[0].name}` });

  await output.keyboard.press("1");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await output.keyboard.press("0");
  await expect(first).toHaveAttribute("aria-pressed", "false");

  await output.getByRole("button", { name: "Sonando", exact: true }).click();
  const controller = await open(await pageAs("admin"), "controller");
  await expect(controller.getByTitle("Silenciada: no va a sonar")).toBeVisible();
  await expect(first).toBeDisabled();
});

test("an output nobody has touched says so, its first tap unlocks and plays, and remote presses play after", async ({
  page,
  pageAs,
}) => {
  const output = await pageAs("admin");
  // A real browser's rule (automation browsers let any page sound): a page's audio starts
  // suspended and only resumes inside a tap or a key.
  await output.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        void super.suspend();
      }

      override resume() {
        return navigator.userActivation.isActive ? super.resume() : new Promise<void>(() => undefined);
      }
    };
    localStorage.setItem("launchpad-output-mode", "true");
  });
  const gongArrived = new Promise<void>((resolve) => {
    output.on("websocket", (ws) =>
      ws.on("framereceived", (frame) => {
        if (String(frame.payload).includes('"soundId":"50"')) resolve();
      })
    );
  });
  await output.goto("/admin/launchpad");
  await expect(output.getByText("Esta pestaña todavía no puede sonar")).toBeVisible();
  const controller = await open(page, "controller");
  await expect(controller.getByText("· sin activar")).toBeVisible();

  // Nobody touched it: a controller's press can't sound there (and isn't queued for later).
  await controller.getByRole("button", { name: "Disparar Gong en las salidas" }).click();
  await gongArrived;
  await output.waitForTimeout(300);
  await expect(output.getByRole("button", { name: "Reproducir Gong" })).toHaveAttribute("aria-pressed", "false");

  await output.getByRole("button", { name: "Reproducir Ta-da" }).click();
  await expect(output.getByRole("button", { name: "Reproducir Ta-da" })).toHaveAttribute("aria-pressed", "true");
  await expect(output.getByText("Esta pestaña todavía no puede sonar")).toBeHidden();
  await expect(controller.getByText("· sin activar")).toBeHidden();

  await controller.getByRole("button", { name: "Disparar Gong en las salidas" }).click();
  await expect(output.getByRole("button", { name: "Reproducir Gong" })).toHaveAttribute("aria-pressed", "true");
});
