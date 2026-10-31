import { DAY_TIMES, OPEN_SPACE_TIMES, TALKS } from "app/conf/talks";

import { SCENE_IDS, type SceneId } from "./scenes";

/**
 * OWU CONF 2026 (07 NOV): the scenes the day actually uses, by moment, shown first in the
 * desk's library; the rest of the registry stays one tap away. Each scene appears once.
 */
export const CONF_SECTIONS: { title: string; scenes: SceneId[] }[] = [
  {
    title: `Recepción · ${DAY_TIMES.recepcion.start}`,
    scenes: ["logo", "welcome", "checkin", "program", "next", "wifi-qr", "conduct", "facilities", "sponsor-wall"],
  },
  {
    title: `Bienvenida · ${OPEN_SPACE_TIMES.bienvenida.start}`,
    scenes: ["launch", "opening", "history", "origin", "live-poll", "quiz", "trivia"],
  },
  {
    title: `Mercado de ideas · ${OPEN_SPACE_TIMES.mercado.start}`,
    scenes: ["principles", "owy-howto", "steps", "owy-face", "board"],
  },
  {
    title: `Open space · ${OPEN_SPACE_TIMES.sesiones.start}`,
    scenes: ["grid", "rooms-now", "rounds", "room", "reminders"],
  },
  {
    title: `Coffee break · ${OPEN_SPACE_TIMES.coffee.start}`,
    scenes: [
      "food",
      "now-playing",
      "speakers",
      "moments",
      "tangram",
      "meetups",
      "pulse",
      "sponsors",
      "word-cloud",
      "aurora",
      "kaleidoscope",
    ],
  },
  {
    title: `Charlas · ${TALKS[0].start}`,
    scenes: ["talk-intro", "talk-timer", "live-questions", "qa", "rating", "applause"],
  },
  {
    title: `Cierre · ${DAY_TIMES.despedida.start}`,
    scenes: ["photo", "closing", "team", "feedback", "after"],
  },
  { title: "Siempre a mano", scenes: ["message", "alert", "countdown", "clock", "test-card", "black"] },
];

const CONF_SET = new Set<SceneId>(CONF_SECTIONS.flatMap((section) => section.scenes));
/** Everything the shortlist leaves out, still in the library behind «Todas». */
export const OTHER_SCENE_COUNT = SCENE_IDS.length - CONF_SET.size;

/** A step: scene, seconds on air, and the params it overrides (the rest are the scene's defaults). */
type LoopStep = [scene: SceneId, sec: number, params?: Record<string, unknown>];

/**
 * Loops for the stretches nobody is driving the wall: one tap loads one into the guion and
 * Play runs it on repeat. Phone scenes stay out (every take is a new round, so a loop would
 * wipe their votes), and so do the moments run by hand (bienvenida, the talks, the photo).
 * Seconds: 15 for a screen read at a glance, 20 for a list, 25–30 for live grids and photos.
 */
export const CONF_LOOPS: { id: string; title: string; when: string; steps: LoopStep[] }[] = [
  {
    id: "recepcion",
    title: "Recepción",
    when: `${DAY_TIMES.recepcion.start} – ${DAY_TIMES.recepcion.end}`,
    steps: [
      ["logo", 15],
      ["welcome", 15],
      ["checkin", 20],
      ["next", 15, { label: "Arrancamos en" }],
      ["program", 20],
      ["wifi-qr", 15],
      ["sponsor-wall", 15],
      ["conduct", 15],
      ["facilities", 15],
    ],
  },
  {
    id: "mercado",
    title: "Mercado de ideas",
    when: `${OPEN_SPACE_TIMES.mercado.start} – ${OPEN_SPACE_TIMES.mercado.end}`,
    steps: [
      ["board", 30],
      ["owy-howto", 20],
      ["steps", 15],
      ["principles", 15],
    ],
  },
  {
    id: "sesiones",
    title: "Open space",
    when: `${OPEN_SPACE_TIMES.sesiones.start} – ${OPEN_SPACE_TIMES.sesiones.end}`,
    steps: [
      ["grid", 30],
      ["rooms-now", 25],
      ["rounds", 15],
      ["program", 15],
      ["wifi-qr", 10],
      ["sponsors", 15],
    ],
  },
  {
    id: "coffee",
    title: "Coffee break",
    when: `${OPEN_SPACE_TIMES.coffee.start} – ${OPEN_SPACE_TIMES.coffee.end}`,
    steps: [
      ["next", 15, { label: "Las charlas empiezan en" }],
      ["speakers", 20],
      ["now-playing", 15],
      ["moments", 30],
      ["next", 15, { label: "Las charlas empiezan en" }],
      ["sponsor-wall", 15],
      ["tangram", 25],
      ["meetups", 20],
      ["food", 15],
    ],
  },
  {
    id: "cierre",
    title: "Cierre y salida",
    when: `desde ${DAY_TIMES.after.start}`,
    steps: [
      ["closing", 20],
      ["team", 20],
      ["feedback", 20],
      ["after", 20],
      ["meetups", 20],
      ["sponsor-wall", 15],
    ],
  },
];
