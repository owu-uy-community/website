"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import type { LifelineMarker } from "components/lifeline/types";

import { LifelineSkeleton } from "./Skeletons";
import StoryCarousel from "./StoryCarousel";

// Its own chunk, on the client only: Lifeline measures the screen before it draws anything, and
// the wrapper's fixed height holds the space while its skeleton shows
const Lifeline = dynamic(() => import("components/lifeline").then((module) => module.Lifeline), {
  ssr: false,
  loading: LifelineSkeleton,
});

const DESKTOP = "(min-width: 768px)";

/** null until hydrated: the server doesn't know the screen */
const useDesktop = () =>
  useSyncExternalStore<boolean | null>(
    (onChange) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => null
  );

/**
 * The year-by-year story. From tablets up, Lifeline's rail, scrubbed sideways by the wheel (it hands
 * the page back at either end). On phones a swipeable card per year: Lifeline's own phone layout
 * nests a vertical scroller inside the page. Which one shows is CSS's call, so the server renders
 * the phone's cards as they will stay (switching after hydration pushed the page around), and
 * Lifeline only loads where it shows. Lifeline styles itself with `dark:` variants and the site is
 * dark without a `.dark` root, so the wrapper carries the class.
 */
export default function StoryRail({ markers }: { markers: LifelineMarker[] }) {
  const desktop = useDesktop();

  return (
    <>
      <div className="md:hidden">
        <StoryCarousel markers={markers} />
      </div>
      <div className="dark hidden h-[40rem] text-zinc-400 md:block [&_*]:[scrollbar-color:#3f3f46_transparent]">
        {desktop ? (
          <Lifeline
            birthYear={2006}
            className="h-full"
            markers={markers}
            mode="embed"
            title="La historia, año por año"
          />
        ) : (
          <LifelineSkeleton />
        )}
      </div>
    </>
  );
}
