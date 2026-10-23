import { db } from "../../src/lib/db";
import { speakerProfiles, talkClaims, talkProposals, talkRequests } from "../../src/lib/db/schema";
import { makeEvent, makeUser } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, expectAccessible, lastEmailTo, makeOrganizer, makePublishedEvent } from "./kit";

/** A proposal straight in the database, to any of OWU unless it names communities. */
async function seedProposal(title: string, communityIds: string[] = []) {
  const speaker = await makeUser({ name: "Oradora Sembrada" });
  const [proposal] = await db
    .insert(talkProposals)
    .values({
      speakerUserId: speaker.id,
      speakerName: "Oradora Sembrada",
      title,
      abstract: "Una charla sembrada para la prueba, con más de treinta letras en el resumen.",
      topics: ["web"],
      communityIds,
    })
    .returning();

  return { speaker, proposal };
}

/** The site's navbar and footer: the same on every public page, checked on their own */
const SITE_CHROME = ["#site-menu", "footer"];

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

test("someone proposes a talk with an email code; the community takes it and puts it on an event; the speaker hears both", async ({
  pageAs,
  pageFor,
  request,
}) => {
  const { community, organizer, panel } = await makeOrganizer("editor", { listed: true });
  const event = await makePublishedEvent(community.id, { placeName: "Sinergia" });
  const email = `orador-${Date.now()}-${test.info().workerIndex}@test.owu.uy`;
  const title = `Testing sin dolor ${Date.now().toString(36)}`;

  const page = await pageAs("anonymous");
  await page.goto("/dar-una-charla");
  // The sign-in, then the form (the speaker profile below has chips with the same words)
  const call = page.locator("#proponer-form");
  await call.getByLabel("Email").fill(email);
  await call.getByRole("button", { name: "Enviarme un código" }).click();
  const codeInput = call.getByLabel(/Te mandamos un código/);
  await expect(codeInput).toBeVisible();
  const otp = await lastEmailTo(request, email, /es tu código/);
  await codeInput.fill(/^\d{6}/.exec(otp.subject)?.[0] ?? "");
  // A new account names itself before the form shows
  await call.getByLabel(/Cómo te llamás/).fill("Persona Oradora");
  await call.getByRole("button", { name: "Listo" }).click();

  await call.getByLabel("Título").fill(title);
  await call.getByLabel("De qué va").fill("Cómo escribir tests que no se rompen cada vez que alguien mueve un botón.");
  await call.getByText("Relámpago · 5′").click();
  await call.getByText("Testing y QA").click();
  await call.getByText("Elegir comunidades").click();
  await call.getByText(community.name, { exact: true }).click();
  await call.getByText("Es mi primera charla").click();
  await expect(call.getByLabel(/Tu nombre, como querés que salga/)).toHaveValue("Persona Oradora");
  await call.getByRole("button", { name: "Enviar propuesta" }).click();
  await expect(call.getByRole("status")).toContainText("Tu propuesta salió");
  await expect(page.getByRole("region", { name: "Tus propuestas" })).toContainText(title);
  await lastEmailTo(request, organizer.email, `Charla propuesta para ${community.name}`);

  const panelPage = await pageFor(organizer);
  await panelPage.goto(`${panel}/charlas`);
  const card = panelPage.locator("section", { hasText: title });
  await expect(card.getByText("Primera charla: ofrecé un ensayo")).toBeVisible();
  await card.getByRole("button", { name: "La queremos" }).click();
  // Taken, it moves to «Tomadas» with the speaker's email to coordinate
  const taken = panelPage.locator("section", { hasText: title });
  await expect(taken.getByRole("link", { name: email })).toBeVisible();
  await taken.getByRole("combobox", { name: "Asignar a un evento" }).click();
  await panelPage.getByRole("option", { name: new RegExp(event.name) }).click();
  await expect(taken.getByText("Con fecha")).toBeVisible();

  await page.goto(`/comunidad/${community.slug}/events/${event.slug}`);
  await expect(page.getByText(title)).toBeVisible();
  await lastEmailTo(request, email, `${community.name} quiere tu charla`);
  const scheduled = await lastEmailTo(request, email, "Tu charla va el");
  expect(scheduled.text).toContain("Sinergia");
});

test("another community sees who took a talk from the pool, and can't take it", async ({ pageFor }) => {
  const first = await makeOrganizer("editor");
  const second = await makeOrganizer("editor");
  const title = `Del pozo ${Date.now().toString(36)}`;
  const { proposal } = await seedProposal(title);
  await db.insert(talkClaims).values({ proposalId: proposal.id, communityId: first.community.id });

  const page = await pageFor(second.organizer);
  await page.goto(`${second.panel}/charlas`);
  const card = page.locator("section", { hasText: title });
  await expect(card.getByText(`La tomó ${first.community.name}`)).toBeVisible();
  await expect(card.getByRole("button", { name: "La queremos" })).toHaveCount(0);
  // The page, not the shell around it (its sidebar is checked with the shell)
  await expectAccessible(page, { include: "main" });
});

test("share cards are PNGs of the right size; a draft's are only for its organizers", async ({ pageAs, pageFor }) => {
  const { community, organizer } = await makeOrganizer("editor");
  const published = await makePublishedEvent(community.id);
  const draft = await makeEvent(community.id, {
    name: "Borrador con tarjeta",
    status: "draft",
    startDate: new Date(Date.now() + 30 * DAY),
    endDate: new Date(Date.now() + 30 * DAY + 7_200_000),
  });

  // Signed out: the default request context is the site admin's
  const { request } = await pageAs("anonymous");
  const square = await request.get(`/api/tarjetas/evento/${published.id}/cuadrada`);
  const story = await request.get(`/api/tarjetas/evento/${published.id}/historia`);
  expect([square.headers()["content-type"], pngSize(await square.body())]).toStrictEqual(["image/png", [1080, 1080]]);
  expect([story.headers()["content-type"], pngSize(await story.body())]).toStrictEqual(["image/png", [1080, 1920]]);
  expect((await request.get(`/api/tarjetas/evento/${draft.id}/cuadrada`)).status()).toBe(404);
  const page = await pageFor(organizer);
  expect((await page.request.get(`/api/tarjetas/evento/${draft.id}/cuadrada`)).status()).toBe(200);
});

test("a speaker's public page only once they open it, and it reads well", async ({ pageAs }) => {
  const { speaker } = await seedProposal(`Con página ${Date.now().toString(36)}`);
  const page = await pageAs("anonymous");

  expect((await page.goto(`/charlas/oradores/${speaker.id}`))?.status()).toBe(404);
  await db.insert(speakerProfiles).values({
    userId: speaker.id,
    bio: "Hago frontend hace años y me gusta enseñar.",
    topics: ["web"],
    mentor: true,
    public: true,
  });
  await page.goto(`/charlas/oradores/${speaker.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Oradora Sembrada" })).toBeVisible();
  await expectAccessible(page, { exclude: SITE_CHROME });
});

test("the call for talks reads well signed out, with what communities are looking for", async ({ pageAs }) => {
  const { community } = await makeOrganizer("editor");
  const topic = `Accesibilidad web ${Date.now().toString(36)}`;
  await db.insert(talkRequests).values({ communityId: community.id, topic });
  const page = await pageAs("anonymous");

  await page.goto("/dar-una-charla");
  await expect(page.getByText(`Buscamos charla sobre ${topic}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entrá para proponer" })).toBeVisible();
  await expectAccessible(page, { exclude: SITE_CHROME });
});
