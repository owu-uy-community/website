/**
 * The open space intro at OWU CONF 2026 (Bienvenida, right before the idea market): what an open
 * space is, how the afternoon runs, the principles and the law of two feet, how to propose a
 * topic, and Owy. It follows the «Intro Open Spaces» deck build by build; the principles are
 * drawn the way La Meetup's open space drew them.
 *
 * One Owy Stage scene (`openspace-intro`, params `{slide, build}`): a move is a params edit, never
 * a wipe. /admin/owy/intro moves the wall; /owy/stage/openspace-intro answers a USB clicker by
 * itself, for a laptop wired straight to a projector or a TV.
 */

export const INTRO_SLIDES = [
  { id: "portada", title: "Open space", builds: 2 },
  { id: "que-es", title: "¿En qué consiste?", builds: 3 },
  { id: "dinamica", title: "La dinámica", builds: 5 },
  { id: "principios", title: "Los principios", builds: 4 },
  { id: "dos-pies", title: "La ley de los dos pies", builds: 2 },
  { id: "proponer", title: "¿Cómo propongo un tema?", builds: 4 },
  { id: "owy", title: "Owy", builds: 1 },
] as const;

export type IntroSlideId = (typeof INTRO_SLIDES)[number]["id"];
export type IntroPosition = { slide: string; build: number };

/** La Meetup's yellow doodles and the paper card people fill at the market. */
export const INTRO_DOODLES = ["raise-hand", "group", "lightbulb", "bell", "board", "proposer", "jump", "card"] as const;
export type IntroDoodle = (typeof INTRO_DOODLES)[number];
export const doodleSrc = (name: IntroDoodle) => `/images/conf/openspace/doodles/${name}.webp`;

/** Where a position really is: an unknown slide is the cover, a build past the end the slide's last. */
export function introAt({ slide, build }: IntroPosition) {
  const index = Math.max(
    0,
    INTRO_SLIDES.findIndex((s) => s.id === slide)
  );
  const current = INTRO_SLIDES[index];

  return { index, slide: current, build: Math.max(0, Math.min(build, current.builds - 1)) };
}

/** The next build, else the next slide; null at the end. */
export function introAfter(position: IntroPosition): IntroPosition | null {
  const { index, slide, build } = introAt(position);
  if (build + 1 < slide.builds) return { slide: slide.id, build: build + 1 };
  const next = INTRO_SLIDES[index + 1];

  return next ? { slide: next.id, build: 0 } : null;
}

/** The previous build, else the previous slide fully built (going back shows what was said). */
export function introBefore(position: IntroPosition): IntroPosition | null {
  const { index, slide, build } = introAt(position);
  if (build > 0) return { slide: slide.id, build: build - 1 };
  const previous = INTRO_SLIDES[index - 1];

  return previous ? { slide: previous.id, build: previous.builds - 1 } : null;
}

export type ClickerAction = "next" | "prev" | "blank" | "first" | "last" | "play";

/**
 * What a presentation clicker means by a key. They send PageDown/PageUp (a few the arrows), "b" or
 * "." to black the screen, and F5 / Shift+F5 / Escape from the play button: F5 must never reach
 * the browser, it reloads the page.
 */
const CLICKER: Record<string, ClickerAction> = {
  PageDown: "next",
  ArrowRight: "next",
  ArrowDown: "next",
  " ": "next",
  PageUp: "prev",
  ArrowLeft: "prev",
  ArrowUp: "prev",
  b: "blank",
  B: "blank",
  ".": "blank",
  Home: "first",
  End: "last",
  F5: "play",
};
export const clickerAction = (key: string): ClickerAction | null => CLICKER[key] ?? null;

/** Where a press lands; null when it goes nowhere (the ends, the black screen, play). */
export function introStep(position: IntroPosition, action: ClickerAction): IntroPosition | null {
  if (action === "next") return introAfter(position);
  if (action === "prev") return introBefore(position);
  if (action === "first") return { slide: INTRO_SLIDES[0].id, build: 0 };
  if (action === "last") {
    const last = INTRO_SLIDES[INTRO_SLIDES.length - 1];
    return { slide: last.id, build: last.builds - 1 };
  }

  return null;
}
