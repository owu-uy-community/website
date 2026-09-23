import type { Metadata } from "next";
import Link from "next/link";

import { CONF_DATES, CONF_EVENT } from "app/lib/constants";
import { getRoomsByOpenSpace } from "lib/orpc/rooms/services/get-by-open-space";
import { getSchedulesByOpenSpace } from "lib/orpc/schedules/services/get-by-open-space";
import { getTracksForEvent } from "lib/orpc/sticky-notes/services/get-all-tracks";
import { resolveNowNext } from "lib/openspace/now-next";
import { isFormatId, isTopicId, topicsFromText, type TrackTags } from "lib/openspace/topics";
import { getEventBySlugs } from "lib/tenant-server";

import Footer from "../components/Footer";
import MotionRoot from "../components/MotionRoot";
import Navbar from "../components/Navbar";
import OpenSpaceScene from "../components/OpenSpaceScenes";
import LiveBoard from "./LiveBoard";

const DESCRIPTION =
  "La grilla del open space de OWU CONF, en vivo: qué se está hablando en cada sala, qué viene después y dónde queda cada una.";

export const metadata: Metadata = {
  title: "Open Space en vivo · OWU CONF",
  description: DESCRIPTION,
  alternates: { canonical: "https://conf.owu.uy/openspace" },
  openGraph: {
    title: "Open Space en vivo · OWU CONF",
    description: DESCRIPTION,
    url: "https://conf.owu.uy/openspace",
    siteName: "OWU CONF",
    locale: "es_UY",
    type: "website",
  },
};

/*
 * The board changes constantly while the event runs and LiveBoard refreshes it
 * over the websocket; this only bounds how stale a cold visit can be.
 */
export const revalidate = 60;

/** Shown until the event's board exists — the page is shareable long before that. */
function BeforeTheBoard() {
  const day = new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "long",
    timeZone: "America/Montevideo",
  }).format(new Date(CONF_DATES.event));

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-8 py-24 text-center">
      <OpenSpaceScene className="h-32 w-40" name="mercado" />
      <h1 className="mt-8 font-display text-3xl font-extrabold uppercase leading-none tracking-[-0.02em] text-[#FBF5E7] sm:text-4xl">
        La grilla abre el {day}
      </h1>
      <p className="mt-5 text-pretty text-lg leading-relaxed text-[#FBF5E7]/80">
        El open space no tiene agenda hasta que llegás: las charlas las proponen las personas que están en la sala, el
        mismo día. Cuando arranque el mercado de ideas, esta página muestra en vivo qué se está hablando en cada sala.
      </p>
      <Link
        className="mt-8 inline-flex items-center gap-2 bg-[#FBF5E7] px-6 py-3.5 font-display text-sm font-bold uppercase leading-none text-black transition-colors hover:bg-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
        href="/conf#open-space"
      >
        Cómo funciona un open space
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

export default async function ConfOpenSpacePage() {
  const resolved = await getEventBySlugs(CONF_EVENT.communitySlug, CONF_EVENT.eventSlug);

  const [rooms, schedules, tracks] = resolved
    ? await Promise.all([
        getRoomsByOpenSpace({ openSpaceId: resolved.event.id }),
        getSchedulesByOpenSpace({ openSpaceId: resolved.event.id }),
        getTracksForEvent(resolved.event.id),
      ])
    : [[], [], []];

  /*
   * Tags are written when the card is created, so this is a plain read with no
   * model in the path. Rows created before tagging existed fall back to keyword
   * matching, which is a pure function — still no gateway on a page visit.
   */
  const tags: Record<string, TrackTags> = Object.fromEntries(
    tracks.map((track) => [
      track.id,
      {
        topics: (track.topics ?? topicsFromText(`${track.title} ${track.description ?? ""}`)).filter(isTopicId),
        format: track.format && isFormatId(track.format) ? track.format : null,
      },
    ])
  );

  return (
    <MotionRoot>
      <div className="min-h-[100dvh] w-full overflow-x-clip bg-black">
        <Navbar />
        <main>
          {resolved ? (
            <>
              <div className="mx-auto w-full max-w-[1440px] px-5 pb-8 pt-10 sm:px-8 sm:pb-10">
                <h1 className="font-display text-[length:clamp(30px,8vw,46px)] font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-[#FBF5E7]">
                  Open Space <span className="text-[#F5BB03]">en vivo</span>
                </h1>
                <p className="mt-4 max-w-[560px] text-pretty text-base leading-relaxed text-[#FBF5E7]/75 sm:text-lg">
                  Qué se está hablando ahora, en qué sala y qué viene después.{" "}
                  <Link
                    className="underline decoration-[#F5BB03] decoration-2 underline-offset-4 transition-colors hover:text-[#F5BB03]"
                    href="/conf#open-space"
                  >
                    ¿Primera vez en un open space?
                  </Link>
                </p>
              </div>
              <LiveBoard
                eventId={resolved.event.id}
                initialNowNext={resolveNowNext(schedules, resolved.event.timezone)}
                rooms={rooms}
                schedules={schedules}
                tags={tags}
                timezone={resolved.event.timezone}
                tracks={tracks}
              />
            </>
          ) : (
            <BeforeTheBoard />
          )}
        </main>
        <Footer />
      </div>
    </MotionRoot>
  );
}
