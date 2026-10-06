import { expect, test } from "../fixtures";

for (const path of ["/", "/conf"]) {
  test(`${path} renders without page errors`, async ({ pageAs }) => {
    const page = await pageAs("anonymous");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto(path);

    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).not.toBeEmpty();
    expect(errors).toEqual([]);
  });
}
