import { CONDUCT_EMAIL } from "../../src/lib/community/site";
import { makeEvent, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, expectAccessible, lastEmailTo, mailbox, makeOrganizer, makePublishedEvent } from "./kit";

test("an anonymous report from the event page reaches the responder and OWU; the responder reads it", async ({
  pageAs,
  pageFor,
  request,
}) => {
  const { community, organizer: responder, panel } = await makeOrganizer("editor");
  const other = await makeMember(community.id, "editor", { name: "Otro Editor" });
  const event = await makePublishedEvent(community.id, { startsIn: 2 * DAY, responders: [responder.id] });

  const visitor = await pageAs("anonymous");
  await visitor.goto(`/comunidad/${community.slug}/events/${event.slug}`);
  await expect(visitor.getByText("Si algo no está bien, hablá con Organizadora D.")).toBeVisible();
  await visitor.getByRole("link", { name: "Reportar un problema" }).click();
  await expect(visitor.getByRole("heading", { level: 1, name: "Reportar un problema" })).toBeVisible();
  // The site header is the public chrome, checked by its own specs
  await expectAccessible(visitor, { include: "main" });
  await visitor.getByLabel("¿Qué pasó?").fill("Un asistente hizo comentarios fuera de lugar en el break");
  await visitor.getByRole("button", { name: "Mandar el reporte" }).click();
  await expect(visitor.getByText("Recibimos tu reporte. Gracias por avisar.")).toBeVisible();

  const subject = `Reporte de conducta: ${event.name}`;
  await lastEmailTo(request, responder.email, subject);
  await lastEmailTo(request, CONDUCT_EMAIL, subject);

  const page = await pageFor(responder);
  await page.goto(`${panel}/eventos/${event.id}/conducta`);
  await expect(page.getByText("Un asistente hizo comentarios fuera de lugar en el break")).toBeVisible();
  await expect(page.getByText("Anónimo: no dejó cómo contactarle")).toBeVisible();

  const notResponder = await pageFor(other);
  await notResponder.goto(`${panel}/eventos/${event.id}/conducta`);
  await expect(notResponder.getByText("No tenés acceso")).toBeVisible();
  await expect(notResponder.getByText("Un asistente hizo comentarios")).toHaveCount(0);
});

test("a report that involves the organization goes to OWU only", async ({ pageAs, request }) => {
  const { community, organizer: responder } = await makeOrganizer("editor");
  const event = await makePublishedEvent(community.id, { startsIn: 2 * DAY, responders: [responder.id] });

  const visitor = await pageAs("anonymous");
  await visitor.goto(`/comunidad/${community.slug}/events/${event.slug}/reportar`);
  await visitor.getByLabel("¿Qué pasó?").fill("Alguien de la organización me hizo sentir incómoda");
  await visitor.getByLabel("¿Cómo te contactamos? (opcional)").fill("persona@example.com");
  await visitor.getByRole("checkbox", { name: /Involucra a alguien de la organización/ }).check();
  await visitor.getByRole("button", { name: "Mandar el reporte" }).click();
  await expect(visitor.getByText("Lo recibe solo el equipo de conducta de OWU.")).toBeVisible();

  const subject = `Reporte de conducta: ${event.name}`;
  const toOwu = await lastEmailTo(request, CONDUCT_EMAIL, subject);
  expect(toOwu.text).toContain("Involucra a alguien de la organización");
  expect((await mailbox(request, responder.email)).filter((message) => message.subject === subject)).toStrictEqual([]);
});

test("responders are picked in Ajustes, and an event for more than 60 can't publish with one", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("editor");
  const second = await makeMember(community.id, "editor", { name: "Segunda Responsable" });
  const event = await makePublishedEvent(community.id, { startsIn: 10 * DAY });

  const page = await pageFor(organizer);
  await page.goto(`${panel}/eventos/${event.id}?tab=ajustes`);
  const section = page.locator("#conducta");
  await section.getByRole("checkbox", { name: /Segunda Responsable/ }).click();
  await expect(page.getByText("La página del evento ya lo muestra.")).toBeVisible();
  await page.reload();
  await expect(page.locator("#conducta").getByRole("checkbox", { name: /Segunda Responsable/ })).toBeChecked();

  const start = new Date(Date.now() + 20 * DAY);
  const big = await makeEvent(community.id, {
    name: "Meetup grande",
    summary: "Muchas charlas",
    format: "charlas",
    topics: ["web"],
    description: "Una noche larga",
    status: "draft",
    heldUntil: new Date(Date.now() + 7 * DAY),
    registration: "owu",
    capacity: 61,
    responders: [second.id],
    startDate: start,
    endDate: new Date(start.getTime() + 2 * 3_600_000),
  });
  await page.goto(`${panel}/eventos/${big.id}/editar?paso=revisar`);
  await expect(page.getByText("Nombrá 2 responsables de conducta (más de 60 lugares)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar", exact: true })).toBeDisabled();
});
