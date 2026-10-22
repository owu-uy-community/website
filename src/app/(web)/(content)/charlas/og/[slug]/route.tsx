import { talkEventLabel } from "components/community/TalkCard";
import { getTalks } from "lib/community/content";
import { topicLabel } from "lib/community/topics";
import { renderCover, topicChip } from "lib/og/cover";

/*
 * One OWU-branded cover per talk (1200×630, the social-card size), used by the archive
 * cards and fit to share. Every image is rendered at build time; a new talk ships with
 * a deploy, so unknown slugs 404 instead of rendering on demand.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const talks = await getTalks();

  return talks.map(({ slug }) => ({ slug }));
}

/** "Ana", "Ana y Beto", "Ana, Beto y Caro" */
const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const talk = (await getTalks()).find((item) => item.slug === slug);

  if (!talk) return new Response("Not found", { status: 404 });

  const eventLabel = talkEventLabel(talk.event);
  const year = talk.date.slice(0, 4);

  return renderCover({
    tag: eventLabel.includes(year) ? eventLabel : `${eventLabel} · ${year}`,
    title: talk.title,
    footerLabel: "Charla de",
    footer: joinNames(talk.speakers),
    chips: talk.topics.map((topic) => topicChip(topicLabel(topic))),
  });
}
