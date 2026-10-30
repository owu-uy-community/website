import { makeCommunity, makeEvent } from "../../src/test/factories";
import { expect, test } from "../fixtures";

// The common case for anyone without the OWU Slack: no account yet, a code by email, a name, a seat.
test("someone new signs up for an event with an email code and names themselves, without a reload", async ({
  pageAs,
}) => {
  const community = await makeCommunity({ name: "Comunidad abierta" });
  const start = new Date(Date.now() + 20 * 86_400_000);
  const event = await makeEvent(community.id, {
    name: "Meetup para gente nueva",
    status: "published",
    registration: "owu",
    capacity: 30,
    startDate: start,
    endDate: new Date(start.getTime() + 2 * 3_600_000),
  });
  const email = `rsvp-${Date.now()}-${test.info().workerIndex}@test.owu.uy`;

  const page = await pageAs("anonymous");
  await page.goto(`/comunidad/${community.slug}/events/${event.slug}`);
  const card = page.getByRole("complementary");
  await card.getByRole("button", { name: "Anotarme" }).click();
  await card.getByLabel("Email").fill(email);
  await card.getByRole("button", { name: "Enviarme un código" }).click();
  const codeInput = card.getByLabel(/Te mandamos un código/);
  await expect(codeInput).toBeVisible();

  const [mail] = (await (await page.request.get(`/api/dev/mailbox?to=${encodeURIComponent(email)}`)).json()) as {
    subject: string;
  }[];
  await codeInput.fill(/^\d{6}/.exec(mail.subject)?.[0] ?? "");

  // The card stays on the sign-in until it's done: a new account names itself next
  await card.getByLabel(/Cómo te llamás/).fill("Persona Nueva");
  await card.getByRole("button", { name: "Listo" }).click();

  await card.getByRole("button", { name: "Anotarme" }).click();
  await expect(card.getByText("Estás anotado")).toBeVisible();

  await expect
    .poll(async () => {
      const box = (await (await page.request.get(`/api/dev/mailbox?to=${encodeURIComponent(email)}`)).json()) as {
        subject: string;
      }[];
      return box.some((message) => message.subject === `Estás anotado: ${event.name}`);
    })
    .toBe(true);
});
