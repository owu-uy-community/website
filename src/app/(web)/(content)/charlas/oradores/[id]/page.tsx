import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUpRight, GraduationCap } from "lucide-react";
import Link from "next/link";

import { Badge, ButtonLink, cardClassName, PageHeader, Section } from "components/community/ui";
import Footer from "components/shared/Footer";
import { shortWhen } from "lib/community/time";
import { topicLabel } from "lib/community/topics";
import { publicCaller } from "lib/orpc/server";
import { FORMAT_LABEL, LANGUAGE_LABEL } from "lib/orpc/talks/schemas";

// A speaker opens or closes their page whenever they like: rendered per request (Cache Components)
export const instant = false;

type Params = Promise<{ id: string }>;

const load = (id: string) => publicCaller.talks.speaker({ userId: id }).catch(() => null);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const speaker = await load((await params).id);
  if (!speaker) return {};

  return {
    title: `${speaker.name} · Charlas`,
    description: speaker.bio || `Las charlas de ${speaker.name} en las comunidades de OWU.`,
  };
}

const LINK_LABEL: Record<string, string> = { website: "Web", github: "GitHub", linkedin: "LinkedIn" };

/** A speaker's page, only when they made it public: who they are and their talks at OWU events. */
export default async function SpeakerPage({ params }: { params: Params }) {
  const speaker = await load((await params).id);
  if (!speaker) notFound();
  const links = Object.entries(speaker.links).filter(([, url]) => url);

  return (
    <>
      <PageHeader
        actions={
          links.length > 0 ? (
            <>
              {links.map(([kind, url]) => (
                <ButtonLink key={kind} href={url ?? ""} rel="noopener nofollow" size="sm" variant="secondary">
                  {LINK_LABEL[kind] ?? kind}
                  <ArrowUpRight aria-hidden className="ml-1.5 size-3.5" />
                </ButtonLink>
              ))}
            </>
          ) : null
        }
        description={speaker.bio || undefined}
        eyebrow="Da charlas en OWU"
        title={speaker.name}
      >
        <div className="owu-rise mt-6 flex flex-wrap gap-2">
          {speaker.topics.map((topic) => (
            <Badge key={topic}>{topicLabel(topic)}</Badge>
          ))}
          {speaker.formats.map((format) => (
            <Badge key={format}>{FORMAT_LABEL[format as keyof typeof FORMAT_LABEL] ?? format}</Badge>
          ))}
          {speaker.languages.map((language) => (
            <Badge key={language}>{LANGUAGE_LABEL[language as keyof typeof LANGUAGE_LABEL] ?? language}</Badge>
          ))}
          {speaker.mentor ? (
            <Badge tone="accent">
              <GraduationCap aria-hidden className="size-3.5" />
              Mentorea a quien da su primera charla
            </Badge>
          ) : null}
        </div>
      </PageHeader>

      <Section eyebrow="Charlas" title="En las comunidades de OWU">
        {speaker.talks.length === 0 ? (
          <p className="text-zinc-400">Todavía no hay charlas suyas en eventos publicados.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {speaker.talks.map((talk) => (
              <li key={`${talk.title}-${talk.event.url}`} className={cardClassName(false, "flex flex-col gap-2 p-5")}>
                <p className="font-title text-lg font-semibold text-white">{talk.title}</p>
                <p className="text-sm text-zinc-400">
                  <Link className="text-zinc-200 hover:text-white" href={talk.event.url}>
                    {talk.event.name}
                  </Link>{" "}
                  · {talk.community.name}
                </p>
                <p className="font-terminal text-sm text-zinc-400 tabular-nums">{shortWhen(talk.event.startDate)}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-10">
          <ButtonLink arrow href="/dar-una-charla#proponer" variant="secondary">
            Proponé tu charla
          </ButtonLink>
        </div>
      </Section>

      <Footer />
    </>
  );
}
