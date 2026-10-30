import { cacheLife } from "next/cache";
import { getLanding } from "lib/community/content";
import { llmsTxt } from "lib/community/markdown";

// Built with the deploy: the page list and the CMS figure only change with one
async function render() {
  "use cache";
  cacheLife("max");

  const landing = await getLanding();
  const people = landing?.stats?.find((stat) => stat.title === "Personas" && stat.subtitle === "conectadas")?.count;

  return llmsTxt({ people: people ?? null });
}

export async function GET() {
  return new Response(await render(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
