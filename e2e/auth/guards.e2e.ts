import { expect, signedOut, test } from "../fixtures";

test("an anonymous visitor is sent to /login from the admin", async ({ pageAs }) => {
  const page = await pageAs("anonymous");

  await page.goto("/admin");

  await expect(page).toHaveURL(/\/login$/);
});

test("a site admin lands on the dashboard", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin$/);
});

test("the API refuses an anonymous write and a non-staff write", async ({ playwright, tenant, pageAs }) => {
  const anonymous = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: signedOut,
  });
  const input = {
    json: {
      communityId: tenant.community.id,
      name: "Intruso",
      startDate: "2026-11-07T17:30:00.000Z",
      endDate: "2026-11-07T23:30:00.000Z",
    },
  };

  const anonymousResponse = await anonymous.post("/api/orpc/openSpaces/create", { data: input });
  expect(anonymousResponse.status()).toBe(401);

  const member = await pageAs("member");
  const memberResponse = await member.request.post("/api/orpc/openSpaces/create", { data: input });
  expect(memberResponse.status()).toBe(403);

  await anonymous.dispose();
});
