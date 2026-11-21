import { expect, test } from "../fixtures";

// What AI agents fetch: the home page's Markdown twin, the Markdown 404, llms.txt and the trust pages

test("the home page answers Markdown to agents and HTML to browsers, from the same URL", async ({ request }) => {
  const markdown = await request.get("/", { headers: { Accept: "text/markdown" } });

  expect(markdown.status()).toBe(200);
  expect(markdown.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
  expect(markdown.headers().vary).toContain("Accept");
  const body = await markdown.text();
  expect(body).toMatch(/^# OWU Uruguay/);
  expect(body).toContain("## Qué se viene");

  const html = await request.get("/", { headers: { Accept: "text/html" } });

  expect(html.status()).toBe(200);
  expect(html.headers()["content-type"]).toContain("text/html");
  const page = await html.text();
  expect(page).toContain('<link rel="canonical" href="https://www.owu.uy"');
  expect(page).toContain('<link rel="alternate" type="text/markdown" href="https://www.owu.uy/index.md"');
  expect(page).toContain('"contactPoint"');
  expect(page).toContain('"addressCountry":"UY"');
});

test("a page that doesn't exist answers 404 in Markdown to agents, and in HTML to browsers", async ({ request }) => {
  const markdown = await request.get("/no-existe-esta-pagina", { headers: { Accept: "text/markdown" } });

  expect(markdown.status()).toBe(404);
  expect(markdown.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
  await expect(markdown.text()).resolves.toContain("(https://www.owu.uy/llms.txt)");

  const html = await request.get("/no-existe-esta-pagina", { headers: { Accept: "text/html" } });

  expect(html.status()).toBe(404);
  expect(html.headers()["content-type"]).toContain("text/html");
});

test("llms.txt and the Markdown twin are plain files", async ({ request }) => {
  const llms = await request.get("/llms.txt");

  expect(llms.status()).toBe(200);
  expect(llms.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  await expect(llms.text()).resolves.toMatch(/^# OWU Uruguay\n\n> /);

  const twin = await request.get("/index.md");

  expect(twin.status()).toBe(200);
  expect(twin.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
});

test("the English trust paths land on the Spanish pages", async ({ request }) => {
  for (const [from, to] of [
    ["/contact", "/contacto"],
    ["/privacy", "/privacidad"],
  ]) {
    const response = await request.get(from!, { maxRedirects: 0 });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(to);
  }
});

test("the contact page says where to write", async ({ pageAs }) => {
  const page = await pageAs("anonymous");
  const response = await page.goto("/contacto");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Hablemos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "conducta@owu.uy" })).toBeVisible();
  // The topic list alone carries well over the 500 characters agents look for on a trust page
  expect((await page.locator("dl").first().textContent())?.length).toBeGreaterThan(500);
});
