import { getLanding } from "lib/community/content";
import { llmsTxt } from "lib/community/markdown";

// Built with the deploy: the page list and the CMS figure only change with one
export const dynamic = "force-static";

export async function GET() {
  const landing = await getLanding();
  const people = landing?.stats?.find((stat) => stat.title === "Personas" && stat.subtitle === "conectadas")?.count;

  return new Response(llmsTxt({ people: people ?? null }), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
