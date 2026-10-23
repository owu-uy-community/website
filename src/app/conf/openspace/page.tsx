import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { CONF_EVENT, INTERNAL_ROUTES } from "app/lib/constants";
import { publicCaller } from "lib/orpc/server";
import { getEventBySlugs } from "lib/tenant-server";

import Footer from "../components/Footer";
import MotionRoot from "../components/MotionRoot";
import Navbar from "../components/Navbar";
import BeforeTheBoard from "./BeforeTheBoard";
import LiveBoard from "./LiveBoard";
import { dayState } from "./phase";

const URL = "https://conf.owu.uy/openspace";
const TITLE = "Open Space en vivo · OWU CONF";
const DESCRIPTION =
  "La grilla del open space de OWU CONF, en vivo: qué se está hablando en cada sala, qué viene después y dónde queda cada una.";

const OG_IMAGE = "https://conf.owu.uy/images/conf/og.png";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: URL,
    siteName: "OWU CONF",
    locale: "es_UY",
    type: "website",
    images: [{ url: OG_IMAGE, width: 1800, height: 945, alt: "OWU CONF — 07.11.2026, Sinergia Faro, Montevideo" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
};

/** Holds the board's place while it loads, so nothing jumps when it lands. */
function BoardSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[1440px] animate-pulse px-4 pt-6 pb-24 sm:px-8">
      <div className="h-12 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.03]" />
      <div className="mt-6 grid gap-6 xl:grid-cols-12 xl:gap-8">
        <div className="h-72 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.03] xl:col-span-5" />
        <div className="h-72 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.03] xl:col-span-7" />
      </div>
      <div className="mt-8 h-96 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.03]" />
    </div>
  );
}

/**
 * The board, read on every visit: the hooks take their first data as fresh for half a minute, so a
 * cached snapshot would show a stale grid exactly when it changes fastest (the mercado).
 */
async function Board() {
  await connection();

  const resolved = await getEventBySlugs(CONF_EVENT.communitySlug, CONF_EVENT.eventSlug);
  // Until the conf's board exists the page explains the afternoon instead: it is shareable long before
  if (!resolved?.event.isActive) return <BeforeTheBoard />;

  const { event } = resolved;
  const [rooms, schedules, notes] = await Promise.all([
    // Public procedures through the anonymous caller, like the community agenda
    publicCaller.rooms.getByOpenSpace({ openSpaceId: event.id }),
    publicCaller.schedules.getByOpenSpace({ openSpaceId: event.id }),
    publicCaller.tracks.list({ openSpaceId: event.id }),
  ]);
  const at = Date.now();

  if (dayState(schedules, event.timezone, new Date(at)).phase === "before-day") {
    return <BeforeTheBoard rooms={rooms.filter((room) => room.isActive)} />;
  }

  return (
    <LiveBoard
      at={at}
      eventId={event.id}
      initialNotes={notes}
      initialRooms={rooms}
      initialSchedules={schedules}
      shareUrl={URL}
      timezone={event.timezone}
    />
  );
}

export default function ConfOpenSpacePage() {
  return (
    <MotionRoot>
      <div className="min-h-[100dvh] w-full overflow-x-clip bg-black">
        <Navbar />
        <main>
          <header className="mx-auto w-full max-w-[1440px] px-5 pt-10 pb-6 sm:px-8 sm:pb-8">
            <h1 className="font-display text-[length:clamp(30px,8vw,46px)] leading-[0.95] font-extrabold tracking-[-0.02em] text-[#FBF5E7] uppercase">
              Open Space <span className="text-[#F5BB03]">en vivo</span>
            </h1>
            <p className="mt-4 max-w-[600px] text-base leading-relaxed text-pretty text-[#FBF5E7]/80 sm:text-lg">
              Qué se está hablando en cada sala, qué viene después y dónde queda cada una.{" "}
              <Link
                className="underline decoration-[#F5BB03] decoration-2 underline-offset-4 transition-colors hover:text-[#F5BB03]"
                href={`${INTERNAL_ROUTES.conf.current}#open-space`}
              >
                ¿Primera vez en un open space?
              </Link>
            </p>
          </header>
          <Suspense fallback={<BoardSkeleton />}>
            <Board />
          </Suspense>
        </main>
        <Footer />
      </div>
    </MotionRoot>
  );
}
