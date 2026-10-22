import { expect, test } from "../fixtures";

test("someone without Slack signs in with an email code, names themselves and lands where they were going", async ({
  pageAs,
}) => {
  const page = await pageAs("anonymous");
  const email = `e2e-${Date.now()}-${test.info().workerIndex}@test.owu.uy`;

  await page.goto("/organizar/panel");
  await expect(page).toHaveURL(/\/login\?next=%2Forganizar%2Fpanel$/);

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  const codeInput = page.getByLabel(/Te mandamos un código/);
  await expect(codeInput).toBeVisible();

  const [mail] = (await (await page.request.get(`/api/dev/mailbox?to=${encodeURIComponent(email)}`)).json()) as {
    subject: string;
  }[];
  const code = /^\d{6}/.exec(mail.subject)?.[0] ?? "";

  await codeInput.fill(code === "000000" ? "111111" : "000000");
  await expect(page.getByText("Ese código no es correcto.")).toBeVisible();
  await codeInput.fill(code);

  await page.getByLabel(/Cómo te llamás/).fill("Persona de Prueba");
  await page.getByRole("button", { name: "Listo" }).click();

  await expect(page).toHaveURL(/\/organizar\/panel\/reclamar$/);
  await expect(page.getByRole("heading", { name: "¿Qué comunidad organizás?" })).toBeVisible();
});
