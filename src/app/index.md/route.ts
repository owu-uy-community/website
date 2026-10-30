import { cacheLife } from "next/cache";
import { getCommunities, getLanding, getTalks } from "lib/community/content";
import { getUpcomingEvents } from "lib/community/events";
import { homeMarkdown } from "lib/community/markdown";

// The home page's Markdown twin (src/proxy.ts serves it for `Accept: text/markdown` on /), as fresh as the page
async function render() {
  "use cache";
  cacheLife("hours");

  const [landing, events, communities, talks] = await Promise.all([
    getLanding(),
    getUpcomingEvents(),
    getCommunities(),
    getTalks(),
  ]);

  const body = homeMarkdown({
    description:
      landing?.description ??
      "Un espacio donde personas apasionadas por la tecnología se reúnen, comparten y convierten sus ideas en realidad.",
    about: (landing?.mainSectionContent as unknown as string | undefined) ?? "",
    people: landing?.stats?.find((stat) => stat.title === "Personas" && stat.subtitle === "conectadas")?.count ?? null,
    events,
    communities,
    talks,
  });

  return body;
}

export async function GET() {
  return new Response(await render(), { headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept" } });
}
