import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommunityMark } from "components/shared/CommunityMark";
import { caller } from "lib/orpc/server";
import { getEventBySlugs } from "lib/tenant-server";

import { SurveyForm } from "./SurveyForm";

type Params = Promise<{ communitySlug: string; eventSlug: string }>;

// It opens and closes while people answer, and `?sala=` changes what it says: rendered per request,
// allowed to block (Cache Components).
export const instant = false;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) return {};

  return {
    title: `Encuesta · ${resolved.event.name}`,
    description: `Contanos qué te pareció ${resolved.event.name}: son dos minutos.`,
    robots: { index: false },
  };
}

/** The post-event survey, from the T+1 message or a room's QR (`?sala=<roomId>`). Phones first. */
export default async function SurveyPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ sala?: string }>;
}) {
  const { communitySlug, eventSlug } = await params;
  const { sala } = await searchParams;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) notFound();

  const { community, event } = resolved;
  const survey = await caller.surveys.public({ communitySlug, eventSlug });
  const room = survey?.rooms.find((candidate) => candidate.id === sala) ?? null;
  const agendaHref = `/comunidad/${community.slug}/events/${event.slug}`;

  return (
    <main className="min-h-dvh bg-[#18181b] text-white">
      <div className="mx-auto w-full max-w-xl px-4 pt-8 pb-16 sm:px-6 sm:pt-14">
        <Link
          className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
          href={`/comunidad/${community.slug}`}
        >
          <CommunityMark logoUrl={community.logoUrl} name={community.name} size={28} slug={community.slug} />
          {community.name}
        </Link>

        {survey ? (
          <SurveyForm agendaHref={agendaHref} room={room} survey={survey} />
        ) : (
          <section className="flex flex-col items-center pt-16 text-center">
            <Image
              alt=""
              className="size-24 object-contain"
              height={192}
              src="/images/logos/carpincho.png"
              width={192}
            />
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight">La encuesta no está abierta</h1>
            <p className="mt-3 max-w-sm text-zinc-400">
              Todavía no arrancó o ya cerró. Si viniste a {event.name}, ¡gracias igual!
            </p>
            <Link
              className="mt-8 inline-flex h-12 items-center rounded-xl bg-white/10 px-5 font-semibold transition-colors hover:bg-white/15"
              href={agendaHref}
            >
              Ver la agenda
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
