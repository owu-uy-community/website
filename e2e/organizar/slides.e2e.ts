import { db } from "../../src/lib/db";
import { surveys } from "../../src/lib/db/schema";
import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, makeOrganizer, makePublishedEvent } from "./kit";

test("the welcome slides: they render, the arrows move them, the responders and the survey's QR are there", async ({
  pageFor,
}) => {
  const { community, panel } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin", { name: "Ana Responsable" });
  const event = await makePublishedEvent(community.id, {
    name: "Noche de charlas",
    responders: [admin.id],
    slideNotes: { wifiName: "Invitados", wifiPassword: "bienvenidos" },
  });
  await db.insert(surveys).values({ eventId: event.id, title: "¿Qué te pareció?", isOpen: true });
  const page = await pageFor(admin);

  await page.goto(`${panel}/eventos/${event.id}/presentacion`);
  const deck = page.getByRole("region", { name: "Presentación de bienvenida" });
  await expect(deck.getByRole("heading", { name: "Noche de charlas" })).toBeVisible();
  await expect(page.getByTestId("slide-counter")).toHaveText("1 / 5");
  await expectAccessible(page);

  await page.keyboard.press("ArrowRight");
  await expect(deck.getByText("bienvenidos")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(deck.getByText(/hablá con Ana R\./)).toBeVisible();
  await expect(deck.getByRole("img", { name: "QR para reportar un problema" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("slide-counter")).toHaveText("2 / 5");
  await page.keyboard.press("End");
  await expect(deck.getByRole("img", { name: "QR de la encuesta" })).toBeVisible();
  await expect(page.getByTestId("slide-counter")).toHaveText("5 / 5");
});

test("someone who can't open events doesn't get the slides (they carry the wifi)", async ({ pageFor }) => {
  const { community, panel } = await makeOrganizer();
  const member = await makeMember(community.id, "member");
  const event = await makePublishedEvent(community.id, { slideNotes: { wifiPassword: "secreta" } });
  const page = await pageFor(member);

  await page.goto(`${panel}/eventos/${event.id}/presentacion`);
  await expect(page.getByText("secreta")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /No tenés acceso|Esta página no está/ })).toBeVisible();
});
