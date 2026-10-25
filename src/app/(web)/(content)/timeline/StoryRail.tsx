"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import type { LifelineMarker } from "components/lifeline/types";

// Phones only, and after hydration: the carousel (embla) stays out of the desktop bundle
const StoryCarousel = dynamic(() => import("./StoryCarousel"), { ssr: false });

// Its own chunk, on the client only: Lifeline measures the screen before it draws anything (its
// server render was an invisible placeholder), and the wrapper's fixed height holds the space
const Lifeline = dynamic(() => import("components/lifeline").then((module) => module.Lifeline), { ssr: false });

const DESKTOP = "(min-width: 768px)";

/** null until hydrated: the server doesn't know the screen, so it renders the placeholder */
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
 * nests a vertical scroller inside the page. Lifeline styles itself with `dark:` variants and the
 * site is dark without a `.dark` root, so the wrapper carries the class.
 */
export default function StoryRail({ markers }: { markers: LifelineMarker[] }) {
  const desktop = useDesktop();

  if (desktop === false) return <StoryCarousel markers={markers} />;

  return (
    <div className="dark h-[34rem] text-zinc-400 sm:h-[40rem] [&_*]:[scrollbar-color:#3f3f46_transparent]">
      {desktop ? (
        <Lifeline birthYear={2006} className="h-full" markers={markers} mode="embed" title="La historia, año por año" />
      ) : null}
    </div>
  );
}
