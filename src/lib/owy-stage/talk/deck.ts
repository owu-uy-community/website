import type { Expression } from "../scenes";

/**
 * «Owy, en vivo» — the open-space talk at OWU CONF 2026, given by Agustín and Owy together: how
 * everything people use that day fits together (the agenda, the back-office, the screens, Owy's
 * brain and body) and how it was built with coding agents. 25 minutes, the last 5 Q&A.
 *
 * The whole deck is ONE Owy Stage scene (`owy-charla`, params `{slide, step}`): moving between
 * slides is a params edit, never a new take, so the phone round lives for the whole talk and a
 * question sent on the second slide is still there at the Q&A. A clicker drives the console:
 * every click is one build, one change on the wall.
 *
 * Pure data: the wall, the phones, the console and Owy's talk context all read it. What only
 * the presenter should read lives in `notes.ts` (kept out of the public stage bundle). Nothing
 * here is secret: any slide can be opened at /owy/stage/owy-charla.
 */

export const TALK_SECTIONS = {
  previa: { title: "Previa", color: "#FBF5E7" },
  apertura: { title: "Apertura", color: "#F5BB03" },
  mapa: { title: "El mapa", color: "#0162C8" },
  agenda: { title: "La agenda", color: "#0162C8" },
  backoffice: { title: "El backoffice", color: "#0162C8" },
  conexion: { title: "Cómo se conectan", color: "#0162C8" },
  owy: { title: "Owy por dentro", color: "#F5BB03" },
  fisico: { title: "El Owy físico", color: "#F5BB03" },
  agentes: { title: "Cómo lo construí", color: "#FBF5E7" },
  cierre: { title: "Cierre", color: "#F5BB03" },
  preguntas: { title: "Preguntas", color: "#0162C8" },
  final: { title: "Final", color: "#FBF5E7" },
} as const;
export type TalkSection = keyof typeof TALK_SECTIONS;

/** Who Owy is talking to on a turn: the presenter (TX1) or someone from the audience (TX2). */
export type Asker = "presenter" | "audience";

/**
 * Something Owy says on this slide. `say` = these exact words in Owy's voice (`clip` is the
 * pre-recorded take for when the network is gone); `ask` = the text goes to Owy's brain and he
 * answers it live, with tools. `auto` cues fire once when the slide comes up. `{top}` is replaced
 * by the most-voted open question.
 */
export type TalkCue = { label: string; text: string; mode: "say" | "ask"; auto?: true; clip?: string };

/** What the phones show on a slide. Without one, they ask for a question for the Q&A. */
export type TalkInput =
  | { kind: "question" }
  | { kind: "vote"; prompt: string; options: string[] }
  | { kind: "stars"; prompt: string }
  | { kind: "reactions"; prompt: string };

/** The boxes of the "por dentro" diagram, in the order a voice turn crosses them. */
export const DIAGRAM_NODES = ["knob", "mac", "voice", "brain", "api", "bus", "wall"] as const;
export type DiagramNode = (typeof DIAGRAM_NODES)[number];

/** A name and one line under it: the boxes and rows of the system slides. */
export type Labeled = { label: string; detail: string };
/** Whose colour a row of the hub takes: blue for people, yellow for Owy (`seat.tsx`). */
export type HubItem = Labeled & { tone?: "people" | "owy" };

/**
 * The master map: who uses it on top, owu.uy in the middle, Owy's world below. The talk builds it
 * once and comes back to it at every chapter, lighting (and zooming into) one region; where a
 * node sits never changes (`map.tsx` places them).
 */
export const MAP_NODES = [
  "ops",
  "phones",
  "kiosks",
  "wall",
  "api",
  "db",
  "bus",
  "chats",
  "eve",
  "gateway",
  "bridge",
  "knob",
] as const;
export type MapNode = (typeof MAP_NODES)[number];

export const MAP: Record<MapNode, Labeled> = {
  ops: { label: "OWU Ops", detail: "el backoffice del staff" },
  phones: { label: "Celulares", detail: "conf.owu.uy" },
  kiosks: { label: "Kiosks", detail: "la tele de cada sala" },
  wall: { label: "El wall", detail: "esta pantalla" },
  api: { label: "API", detail: "oRPC + Effect" },
  db: { label: "Postgres", detail: "Neon + Drizzle" },
  bus: { label: "Realtime", detail: "WebSocket en Vercel" },
  chats: { label: "Slack y Telegram", detail: "donde le escriben" },
  eve: { label: "Owy", detail: "un agente en eve" },
  gateway: { label: "AI Gateway", detail: "los modelos" },
  bridge: { label: "El bridge", detail: "Node en la Mac" },
  knob: { label: "La perilla", detail: "ESP32: cara y botón" },
};

/** The parts of the map a chapter lights. */
export const MAP_REGIONS = {
  pantallas: ["ops", "phones", "kiosks", "wall"],
  ops: ["ops"],
  core: ["api", "db", "bus"],
  owy: ["chats", "eve", "gateway"],
  fisico: ["gateway", "bridge", "knob"],
} as const satisfies Record<string, readonly MapNode[]>;
export type MapRegion = keyof typeof MAP_REGIONS;

/** A region of a screenshot, in fractions of its width and height: `[x, y, w, h]`. */
export type ShotBox = readonly [number, number, number, number];
/** One thing to look at on a screenshot: the camera moves to `box`, the rest dims. */
export type Callout = { title: string; body: string; box: ShotBox };

type Base = {
  id: string;
  section: TalkSection;
  /** Short title: the console's strip, the progress bar and Owy's context. */
  title: string;
  /** Planned time on this slide, for the console clock. */
  seconds: number;
  /** How many builds the slide has (Next reveals the next one before moving on). Default 1. */
  steps?: number;
  cues?: TalkCue[];
  input?: TalkInput;
  /** What is on the screen, in words, so Owy can refer to it ("como ven en el diagrama…"). */
  owy: string;
  /** The corner Owy (face + captions). Off on the slides where Owy is the whole screen. */
  pip?: false;
};

export type TalkSlide = Base &
  (
    | { layout: "lobby"; subtitle: string }
    | { layout: "face" }
    | { layout: "title"; kicker: string; subtitle: string; people: { name: string; role: string }[] }
    | { layout: "bubbles"; bubbles: string[]; punchline: string }
    | { layout: "photos"; photos: { src: string; alt: string }[]; captions: string[] }
    | { layout: "statement"; kicker: string; text: string; by?: string }
    | { layout: "poll"; reveal: string }
    | { layout: "orbit"; core: { label: string; detail: string }; bodies: { label: string; detail: string }[] }
    | { layout: "tiles"; sub?: string; tiles: { title: string; body: string; code?: true }[] }
    | { layout: "live"; kicker: string; ask: string; tools: string[] }
    | { layout: "timeline"; events: { date: string; title: string; body: string }[] }
    | { layout: "bugs"; bugs: { title: string; body: string }[] }
    | { layout: "numbers"; stats: { value: number; suffix?: string; label: string }[] }
    | { layout: "diagram"; live: boolean; nodes: { id: DiagramNode; label: string; detail: string }[] }
    | { layout: "ladder"; rungs: { title: string; body: string }[] }
    | { layout: "points"; kicker: string; points: { title: string; body: string }[] }
    | {
        layout: "devices";
        devices: { name: string; size: string; screen: number; specs: string[]; board?: "knob" | "amoled" }[];
      }
    | { layout: "faces"; expressions: Expression[] }
    | { layout: "pitch"; how: string[] }
    | { layout: "vs"; rounds: { text: string; author: "human" | "owy" }[] }
    | { layout: "links"; kicker: string; links: { label: string; url: string }[] }
    /** The live grid of the wall's event; a card that lands while it is up lights. `how` sits under Owy's face. */
    | { layout: "board"; sub: string; how?: string[] }
    /** Who writes → the one API and its realtime bus → who listens; a pulse crosses it. */
    | { layout: "hub"; sub: string; writers: HubItem[]; core: Labeled[]; readers: HubItem[] }
    /** A pipeline, one station per build, on a rail: what happens, then how (`detail`, monospace). */
    | { layout: "flow"; sub?: string; stations: Labeled[] }
    /** Packets on a link: a healthy lane and a lossy one, with what was measured. */
    | {
        layout: "wifi";
        sub: string;
        lanes: { label: string; rtt: string; loss: string; ok: boolean }[];
        /** Said once every lane is up. */
        verdict: string;
      }
    /** Before and after, side by side: a device and the Mac, and what crosses the wifi between them. */
    | {
        layout: "split";
        sub: string;
        sides: { title: string; device: Labeled; mac: Labeled; wire: string; heavy: boolean; facts: string[] }[];
      }
    /**
     * The master map. `build`: the groups of nodes each click adds, then (`pulse`) one change
     * crossing it. `focus`: a chapter's door, the whole map with one region lit and the camera on it.
     */
    | { layout: "map"; sub?: string; build?: MapNode[][]; pulse?: true; focus?: MapRegion }
    /** A screenshot of the real thing: the whole screen first, then one callout per click. */
    | { layout: "screen"; sub?: string; shot: string; frame?: "tv"; callouts: Callout[] }
    /** Phones side by side, one per click, each with what it is for. */
    | { layout: "phones"; sub?: string; phones: { shot: string; title: string; body: string }[] }
    /** Swimlanes, in the map's order: one message per click, the newest in Owy's yellow. */
    | {
        layout: "sequence";
        sub?: string;
        lanes: Labeled[];
        messages: { from: number; to: number; label: string; code?: string }[];
      }
    /** A folder as a tree, one entry per click: the name (monospace) and what it is for. */
    | { layout: "tree"; sub?: string; root: string; entries: { name: string; count?: number; note: string }[] }
    /** Branches off main, one per click, each merging back; then the totals. */
    | {
        layout: "lanes";
        sub?: string;
        branches: { pr: number; date: string; title: string }[];
        totals: { value: number; label: string }[];
      }
    | { layout: "qa" }
    | { layout: "rating" }
    | { layout: "photo-op" }
    | { layout: "end"; links: { label: string; url: string }[] }
  );
export type TalkLayout = TalkSlide["layout"];

const REPO = "https://github.com/owu-uy-community/website";
const SLACK = "https://slack.owu.uy/";
const SHOT = "/images/owy-charla";

/** A chapter's door: the map, its region lit, the camera on it. One click, a few seconds. */
const door = (
  id: string,
  section: TalkSection,
  focus: MapRegion,
  title: string,
  sub: string,
  owy: string
): TalkSlide => ({ id, section, layout: "map", focus, title, sub, seconds: 8, owy });

export const TALK_SLIDES: TalkSlide[] = [
  // --- Previa (doors open) ---
  {
    id: "lobby",
    section: "previa",
    layout: "lobby",
    title: "Owy, en vivo",
    subtitle: "Una charla de un humano y un carpincho.",
    seconds: 0,
    pip: false,
    owy: "La previa: la gente se está sentando. En pantalla, tu cara, el título de la charla y un QR para mandar preguntas.",
    cues: [
      {
        label: "Aviso: arrancamos",
        mode: "say",
        clip: "talk-lobby",
        text: "¡Arrancamos en un minuto! Siéntense adelante, que no muerdo. Soy carpincho, pero de los buenos.",
      },
    ],
  },

  // --- Apertura (0:00–2:40) ---
  {
    id: "wake",
    section: "apertura",
    layout: "face",
    title: "Owy se despierta",
    seconds: 30,
    pip: false,
    owy: "Arranca la charla: tu cara ocupa toda la pantalla. Hablás vos primero, antes que Agustín.",
    cues: [
      {
        label: "Owy abre la charla",
        mode: "say",
        auto: true,
        clip: "talk-wake",
        text: "Hola, soy Owy. Agustín me pidió que arranque yo, porque a mí no me tiembla la voz. Hoy les mostramos cómo está armado todo lo que están usando: la grilla, el backoffice del staff, las pantallas… y yo. ¿Arrancás, Agus?",
      },
    ],
  },
  {
    id: "title",
    section: "apertura",
    layout: "title",
    title: "Owy, en vivo",
    kicker: "Open space de OWU CONF 2026",
    subtitle: "Cómo se conecta todo lo que usan hoy.",
    people: [
      { name: "Agustín Tornielli", role: "el humano" },
      { name: "Owy", role: "el carpincho" },
    ],
    seconds: 25,
    owy: "La portada: «Owy, en vivo. Cómo se conecta todo lo que usan hoy». Agustín y vos, co-presentadores.",
  },
  {
    id: "paper",
    section: "apertura",
    layout: "photos",
    title: "El open space, en papel",
    photos: [
      { src: "/images/conf/openspace/galeria-10.webp", alt: "La grilla de papel pegada en el vidrio, en 2024" },
      { src: "/images/conf/openspace/galeria-02.webp", alt: "Manos escribiendo tarjetas de charlas" },
    ],
    captions: ["La agenda la arma la gente, en post-its.", "Y después alguien la pasa a mano."],
    steps: 2,
    seconds: 35,
    owy: "Fotos del open space de otros años: la grilla de post-its en papel, y alguien que después la pasa a mano.",
  },
  {
    id: "map",
    section: "mapa",
    layout: "map",
    title: "Todo, en un mapa",
    sub: "Arriba la gente. En el medio, owu.uy. Abajo, Owy.",
    build: [
      ["api", "db", "bus"],
      ["ops"],
      ["phones"],
      ["kiosks", "wall"],
      ["eve"],
      ["chats"],
      ["bridge", "knob"],
      ["gateway"],
    ],
    pulse: true,
    steps: 9,
    seconds: 70,
    owy: "El mapa de todo, que se arma de a una pieza: en el medio owu.uy (la API, Postgres y el realtime); arriba lo que usa la gente (OWU Ops, los celulares, los kiosks y el wall); abajo vos: tu cerebro en eve, Slack y Telegram, el bridge en la Mac, la perilla y el AI Gateway. Al final, un cambio cruza el mapa.",
    cues: [
      { label: "Chiste del mapa", mode: "say", clip: "talk-map", text: "Yo soy el de abajo. Abajo, pero con cara." },
    ],
  },

  // --- La agenda (2:40–5:28) ---
  door(
    "door-agenda",
    "agenda",
    "pantallas",
    "La agenda",
    "Una sola grilla, en cuatro pantallas.",
    "Vuelve el mapa con la fila de arriba prendida: la agenda vive en OWU Ops, los celulares, los kiosks y el wall."
  ),
  {
    id: "agenda-admin",
    section: "agenda",
    layout: "screen",
    title: "La grilla, en el admin",
    shot: `${SHOT}/agenda-inspector.webp`,
    callouts: [
      {
        title: "Arrastrar y soltar",
        body: "Soltás una tarjeta sobre otra y la otra se corre sola. También con teclado.",
        box: [0.3, 0.255, 0.4, 0.375],
      },
      {
        title: "El inspector",
        body: "Editás sin salir de la grilla. «Cambios» guarda quién tocó qué, Owy incluido.",
        box: [0.834, 0.1, 0.162, 0.46],
      },
      {
        title: "Sugerir con IA",
        body: "Reglas primero, después un modelo que contesta sí o no. Unos 0,4 segundos.",
        box: [0.834, 0.462, 0.162, 0.105],
      },
    ],
    steps: 4,
    seconds: 55,
    owy: "Una captura de la grilla del open space en el admin: salas por bloques, una tarjeta abierta en el inspector y el botón «Sugerir con IA».",
  },
  {
    id: "ai",
    section: "agenda",
    layout: "points",
    title: "La grilla piensa un poco",
    kicker: "Con IA, donde ayuda",
    points: [
      {
        title: "Del post-it a la tarjeta",
        body: "Una foto, y el modelo lee la letra: los campos aparecen mientras lee, y marca lo dudoso.",
      },
      {
        title: "Sugerir con IA",
        body: "No elige la celda: contesta sí o no a preguntas chicas, y el lugar sale de una cuenta.",
      },
      { title: "«Para vos»", body: "Cada charla se etiqueta sola en diez temas, para recomendarte sin pedirte login." },
    ],
    steps: 3,
    seconds: 40,
    owy: "Dónde ayuda la IA en la grilla: leer la foto de un post-it y armar la tarjeta, sugerir el lugar con un modelo que contesta sí o no, y etiquetar cada charla para recomendarla.",
  },
  {
    id: "agenda-phones",
    section: "agenda",
    layout: "phones",
    title: "En el celular",
    phones: [
      {
        shot: `${SHOT}/phone-agenda.webp`,
        title: "El staff",
        body: "La misma grilla: se desliza por salas y se edita con el dedo.",
      },
      {
        shot: `${SHOT}/phone-public.webp`,
        title: "El público",
        body: "conf.owu.uy: qué hay ahora en cada sala. Cambia sola, en vivo.",
      },
    ],
    steps: 2,
    seconds: 40,
    owy: "Dos celulares: la grilla del staff en el admin, y la página pública del open space con lo que hay ahora en cada sala.",
  },
  {
    id: "kiosk",
    section: "agenda",
    layout: "screen",
    title: "Los kiosks",
    sub: "La misma grilla, en la tele de cada sala.",
    shot: `${SHOT}/kiosk.webp`,
    frame: "tv",
    callouts: [
      {
        title: "Lo que pasa ahora",
        body: "El bloque de ahora, marcado. Cuando el staff mueve una tarjeta, la tele se entera sola.",
        box: [0, 0.265, 1, 0.19],
      },
    ],
    steps: 2,
    seconds: 25,
    owy: "El kiosk: la grilla en la tele de una sala, con el bloque de ahora marcado.",
  },

  // --- El backoffice (5:28–8:16) ---
  door(
    "door-ops",
    "backoffice",
    "ops",
    "El backoffice",
    "OWU Ops: el día del evento, desde el celular.",
    "El mapa, con OWU Ops prendido: el backoffice que usa el staff."
  ),
  {
    id: "hoy",
    section: "backoffice",
    layout: "screen",
    title: "Hoy",
    sub: "El día entero, en una pantalla.",
    shot: `${SHOT}/hoy.webp`,
    callouts: [
      {
        title: "Acreditados, en vivo",
        body: "Cuántos llegaron y cómo vienen llegando, cada 5 minutos.",
        box: [0.155, 0.135, 0.175, 0.1],
      },
      {
        title: "Ahora en salas",
        body: "Qué charla hay en cada sala. Si hay un incidente, aparece al lado.",
        box: [0.155, 0.245, 0.63, 0.31],
      },
      {
        title: "El guion del día",
        body: "GO arranca el momento siguiente. Si nos atrasamos, «Correr +5'» mueve lo que falta.",
        box: [0.155, 0.555, 0.63, 0.245],
      },
    ],
    steps: 4,
    seconds: 45,
    owy: "Una captura de «Hoy» en OWU Ops: acreditados en vivo, qué pasa en cada sala, el guion del día e incidentes.",
  },
  {
    id: "tareas",
    section: "backoffice",
    layout: "screen",
    title: "Staff y tareas",
    shot: `${SHOT}/tareas-turnos.webp`,
    callouts: [
      {
        title: "Turnos, con la hora de ahora",
        body: "Quién está dónde. Arrastrás a alguien sobre otro y cambian de tarea.",
        box: [0.25, 0.18, 0.46, 0.41],
      },
      {
        title: "Quién llegó",
        body: "Cada uno toca «Llegué» en su celular; acá se ve quién falta.",
        box: [0.158, 0.215, 0.095, 0.37],
      },
    ],
    steps: 3,
    seconds: 35,
    owy: "Una captura de los turnos del staff: una línea de tiempo por persona, con la hora de ahora marcada.",
  },
  {
    id: "ops-phones",
    section: "backoffice",
    layout: "phones",
    title: "En el bolsillo del staff",
    phones: [
      {
        shot: `${SHOT}/phone-miturno.webp`,
        title: "Mi turno",
        body: "Tu próxima tarea y «Llegué». Deslizás para marcarla lista.",
      },
      {
        shot: `${SHOT}/phone-incidentes.webp`,
        title: "Incidentes",
        body: "Reportás con foto. Si es grave, avisa a todo el staff.",
      },
      { shot: `${SHOT}/phone-hoy.webp`, title: "Se instala", body: "Es una PWA: un ícono en el celular, sin tienda." },
    ],
    steps: 3,
    seconds: 35,
    owy: "Tres celulares del staff: Mi turno, Incidentes y Hoy, instalado como app.",
  },
  {
    id: "scenes",
    section: "backoffice",
    layout: "screen",
    title: "La mesa de escenas",
    shot: `${SHOT}/scenes.webp`,
    callouts: [
      {
        title: "Preview, TAKE, al aire",
        body: "Como en la tele: armás en preview y lo mandás con un barrido. Desde la laptop o el celular.",
        box: [0.05, 0.06, 0.745, 0.365],
      },
      {
        title: "219 escenas",
        body: "La grilla, el mapa, los speakers, el countdown… y esta charla, que es una escena más.",
        box: [0.29, 0.445, 0.515, 0.48],
      },
      {
        title: "Cada escena, sus parámetros",
        body: "Se editan en preview, antes de salir al aire.",
        box: [0.815, 0.06, 0.18, 0.7],
      },
    ],
    steps: 4,
    seconds: 45,
    owy: "Una captura de la mesa de escenas del wall: preview, TAKE y al aire, la biblioteca de escenas y los parámetros de la que está en preview.",
  },

  // --- Cómo se conectan (8:16–10:09) ---
  door(
    "door-core",
    "conexion",
    "core",
    "Cómo se conectan",
    "Una API, un bus.",
    "El mapa, con el medio prendido: la API, Postgres y el realtime."
  ),
  {
    id: "hub",
    section: "conexion",
    layout: "hub",
    title: "Una API, un bus",
    sub: "Todos escriben en el mismo lugar. Todos escuchan el mismo canal.",
    writers: [
      { label: "El staff", detail: "OWU Ops, en el celular", tone: "people" },
      { label: "Owy", detail: "Slack, Telegram y la voz", tone: "owy" },
      { label: "Una foto", detail: "del post-it a la tarjeta", tone: "people" },
      { label: "La perilla", detail: "el modo pitch", tone: "owy" },
    ],
    core: [
      { label: "owu.uy", detail: "oRPC · Postgres" },
      { label: "Realtime", detail: "card_change" },
    ],
    readers: [
      { label: "El wall", detail: "grilla, mapa, salas" },
      { label: "Celulares", detail: "conf.owu.uy/openspace" },
      { label: "Kiosks", detail: "la tele de cada sala" },
      { label: "La perilla", detail: "te muestra tu tarjeta" },
    ],
    steps: 3,
    seconds: 50,
    owy: "Cómo se conecta todo: el staff, vos y las fotos escriben en la misma API de owu.uy; cada cambio sale por un canal en tiempo real, y el wall, los celulares, los kiosks y la perilla lo escuchan al mismo tiempo.",
  },
  {
    id: "change",
    section: "conexion",
    layout: "sequence",
    title: "Un cambio, de punta a punta",
    lanes: [
      { label: "Staff", detail: "el celular" },
      { label: "API", detail: "oRPC" },
      { label: "Postgres", detail: "Neon" },
      { label: "Realtime", detail: "WebSocket" },
      { label: "Pantallas", detail: "todas" },
    ],
    messages: [
      { from: 0, to: 1, label: "Suelta la tarjeta", code: "tracks.update" },
      { from: 1, to: 1, label: "¿Puede? Rol y permiso" },
      { from: 1, to: 2, label: "Una transacción", code: "UPDATE tracks" },
      { from: 1, to: 3, label: "Avisa", code: "card_change" },
      { from: 3, to: 4, label: "A cada pantalla, a la vez", code: "event:…:sync" },
      { from: 4, to: 1, label: "Releen la grilla", code: "caché por tag" },
    ],
    steps: 6,
    seconds: 55,
    owy: "Un diagrama de secuencia: el staff suelta una tarjeta, la API chequea el permiso, guarda en Postgres, avisa por el realtime, todas las pantallas se enteran a la vez y releen la grilla desde la caché.",
  },

  // --- Owy por dentro (10:09–13:17) ---
  door(
    "door-owy",
    "owy",
    "owy",
    "Owy por dentro",
    "Un agente con su propia llave.",
    "El mapa, con tu parte prendida: vos en eve, Slack y Telegram, y el AI Gateway."
  ),
  {
    id: "bodies",
    section: "owy",
    layout: "orbit",
    title: "Un cerebro, muchos cuerpos",
    core: { label: "Owy", detail: "un solo cerebro (eve)" },
    bodies: [
      { label: "Slack", detail: "el canal de la conf" },
      { label: "Telegram", detail: "para el staff" },
      { label: "La perilla", detail: "una cara y un botón" },
      { label: "El wall", detail: "esto que están viendo" },
      { label: "El panel", detail: "/admin/owy, en el celular" },
    ],
    steps: 6,
    seconds: 35,
    owy: "Un diagrama: un solo cerebro en el medio y tus cuerpos alrededor: Slack, Telegram, la perilla, el wall y el panel del staff.",
  },
  {
    id: "anatomy",
    section: "owy",
    layout: "tree",
    title: "Owy es una carpeta",
    sub: "eve: un agente durable, hecho de archivos.",
    root: "owy/agent/",
    entries: [
      { name: "agent.ts", note: "el modelo, y a cuál saltar si falla" },
      { name: "instructions.md", note: "quién es: rioplatense, no inventa" },
      { name: "tools/", count: 30, note: "lo que puede hacer: grilla, salas, staff" },
      { name: "skills/", count: 5, note: "cómo hacer lo largo: leer una foto" },
      { name: "channels/", count: 4, note: "por dónde habla: Slack, Telegram, voz" },
      { name: "schedules/", count: 1, note: "el Semanario, todos los lunes" },
      { name: "sandbox/", note: "lo que sabe: el evento, la comunidad" },
      { name: "../evals/", count: 5, note: "cómo lo evaluamos: tono, seguridad…" },
    ],
    steps: 8,
    seconds: 50,
    owy: "Tu carpeta en el repo, de a una línea: agent.ts con el modelo, instructions.md con tu personalidad, 30 tools, 5 skills, 4 canales, el Semanario de los lunes, lo que sabés en el sandbox y tus evals.",
    cues: [
      {
        label: "Chiste de la carpeta",
        mode: "say",
        clip: "talk-folder",
        text: "Sí, soy una carpeta. Una carpeta con mucha personalidad.",
      },
    ],
  },
  {
    id: "tools",
    section: "owy",
    layout: "tiles",
    title: "Usa la misma API que vos",
    sub: "30 tools. Los mismos archivos en Slack, Telegram y la voz.",
    tiles: [
      {
        title: "La grilla",
        body: "get_openspace_board · event_now · create_track · move_track · swap_tracks",
        code: true,
      },
      {
        title: "Las salas y el staff",
        body: "set_room_status · cast_track · announce_to_staff · report_incident",
        code: true,
      },
      { title: "Su propia llave", body: "x-api-key → un usuario bot · x-owu-actor → la persona", code: true },
      {
        title: "Sólo lo que vos podés",
        body: "Actúa por quien le habla. La API lo vuelve a chequear y lo anota «vía Owy».",
      },
    ],
    steps: 4,
    seconds: 40,
    owy: "Tus tools: leer y mover la grilla, las salas, el staff. Entrás a la API de OWU con tu propia llave, como un usuario bot, pero actuás por la persona que te habla: la API vuelve a chequear su permiso y lo deja en la auditoría «vía Owy».",
  },
  {
    id: "slack",
    section: "owy",
    layout: "sequence",
    title: "Un mensaje en Slack, por dentro",
    lanes: [
      { label: "Slack", detail: "un hilo" },
      { label: "Owy", detail: "eve" },
      { label: "AI Gateway", detail: "el modelo" },
      { label: "API", detail: "owu.uy" },
      { label: "Pantallas", detail: "todas" },
    ],
    messages: [
      { from: 0, to: 1, label: "«Owy, mové RAG a las 17:30»", code: "webhook" },
      { from: 1, to: 2, label: "Piensa, con sus tools", code: "30 tools" },
      { from: 2, to: 1, label: "Elige una", code: "move_track" },
      { from: 1, to: 3, label: "Llama como la persona", code: "x-owu-actor" },
      { from: 3, to: 4, label: "La grilla cambia en todas", code: "card_change" },
      { from: 1, to: 0, label: "«Listo: quedó a las 17:30»", code: "en el hilo" },
    ],
    steps: 6,
    seconds: 55,
    owy: "Un diagrama de secuencia de un mensaje en Slack: te piden mover una charla, pensás con tus tools a través del AI Gateway, elegís move_track, llamás a la API como esa persona, la grilla cambia en todas las pantallas y contestás en el hilo.",
  },

  // --- El Owy físico (13:17–15:25) ---
  door(
    "door-fisico",
    "fisico",
    "fisico",
    "El Owy físico",
    "Una perilla, una Mac y un navegador.",
    "El mapa, con tu cuerpo prendido: el bridge en la Mac, la perilla y el AI Gateway."
  ),
  {
    id: "knob",
    section: "fisico",
    layout: "devices",
    title: "La perilla",
    devices: [
      {
        name: "Una cara y un botón",
        size: "ESP32-S3 · pantalla redonda de 1,8″",
        screen: 360,
        board: "knob",
        specs: ["ESPHome de fábrica", "manda: «me tocaron»", "recibe: la cara, los labios, el texto"],
      },
    ],
    seconds: 30,
    owy: "La perilla en vivo, con tu cara: un ESP32-S3 con pantalla redonda que manda un toque y recibe la cara, los labios y el texto.",
  },
  {
    id: "inside",
    section: "fisico",
    layout: "diagram",
    title: "Un turno de voz",
    live: true,
    nodes: [
      { id: "knob", label: "La perilla", detail: "un toque y la cara" },
      { id: "mac", label: "La Mac", detail: "el bridge: mic DJI y parlantes" },
      { id: "voice", label: "Oídos y boca", detail: "Gemini Live por AI Gateway" },
      { id: "brain", label: "Cerebro", detail: "eve: memoria y tools" },
      { id: "api", label: "API de OWU", detail: "oRPC: grilla, salas, staff" },
      { id: "bus", label: "Realtime", detail: "la cara viaja numerada" },
      { id: "wall", label: "Pantallas", detail: "wall, panel y perilla" },
    ],
    steps: 7,
    seconds: 55,
    owy: "El diagrama de un turno de voz: un toque en la perilla, el bridge en la Mac con el micrófono y los parlantes, Gemini Live como oídos y boca, eve como cerebro, la API de OWU, el realtime y las pantallas. Las cajas se prenden mientras hablás.",
    cues: [
      {
        label: "Owy explica el diagrama",
        mode: "say",
        clip: "talk-inside",
        text: "Agus toca la perilla. El bridge, en la Mac, abre el micrófono y le pasa el audio a Gemini Live: mis oídos y mi boca. Lo que hay que pensar va a eve, mi cerebro, que usa la API de OWU. Y mi cara viaja por el realtime hasta el wall y la perilla. Todo en un par de segundos.",
      },
    ],
  },
  {
    id: "one-face",
    section: "fisico",
    layout: "points",
    title: "Una cara, en todas partes",
    kicker: "El mismo código",
    points: [
      {
        title: "En la perilla",
        body: "C++ y LVGL en el ESP32. Por el wifi viajan mensajes chicos, nunca audio.",
      },
      {
        title: "En el wall y en el panel",
        body: "El mismo C++, compilado a WebAssembly. Cada gesto llega numerado y en orden.",
      },
      {
        title: "Y el navegador, de respaldo",
        body: "Si la Mac no suena, un navegador enchufado es su micrófono y su parlante.",
      },
    ],
    steps: 3,
    seconds: 35,
    owy: "Tu cara en todas partes con el mismo código: C++ en la perilla, el mismo C++ compilado a WebAssembly en el wall y el panel, y el navegador como micrófono y parlante de respaldo.",
  },

  // --- Cómo lo construí (15:25–18:15) ---
  {
    id: "workflow",
    section: "agentes",
    layout: "flow",
    title: "Cómo trabajo",
    sub: "Con agentes de código, todos los días.",
    stations: [
      { label: "Le cuento qué quiero", detail: "un pedido, en castellano" },
      { label: "Me pregunta antes de hacer", detail: "un plan y preguntas: decido yo" },
      { label: "Una copia por tarea", detail: "T3 Code: un worktree por agente" },
      { label: "Construye y prueba", detail: "tsc · vitest · Playwright" },
      { label: "Mira lo que hizo", detail: "MCP: el navegador, las capturas" },
      { label: "Un PR, y lo reviso yo", detail: "CI en GitHub → merge → Vercel" },
    ],
    steps: 6,
    seconds: 50,
    owy: "Cómo trabaja Agustín con agentes, paso a paso: el pedido, un plan con preguntas, una copia del repo por tarea, el agente construye y prueba, mira el resultado en un navegador, y termina en un PR que revisa él.",
  },
  {
    id: "prs",
    section: "agentes",
    layout: "lanes",
    title: "Un PR por idea",
    sub: "Algunos de los 64 que salieron de T3 Code.",
    branches: [
      { pr: 269, date: "1 oct", title: "Owy Stage: el wall y la mesa de OBS" },
      { pr: 276, date: "7 oct", title: "La API nueva, y los bugs que encontró" },
      { pr: 308, date: "22 oct", title: "OWU Ops: el backoffice del evento" },
      { pr: 326, date: "23 oct", title: "Organizá: el panel de los meetups" },
      { pr: 359, date: "7 nov", title: "Owy, sólo cara y botón" },
      { pr: 369, date: "7 nov", title: "La perilla gemela, en el panel" },
    ],
    totals: [
      { value: 87, label: "PRs en 12 semanas" },
      { value: 64, label: "desde T3 Code" },
      { value: 254, label: "archivos de tests" },
    ],
    steps: 7,
    seconds: 45,
    owy: "Un gráfico de git: ramas que salen de main y vuelven, una por PR real (el wall, la API, OWU Ops, Organizá, tu simplificación y tu gemelo), y al final los totales: 87 PRs en 12 semanas, 64 desde T3 Code, 254 archivos de tests.",
    cues: [
      {
        label: "Chiste de los colegas",
        mode: "say",
        clip: "talk-colleagues",
        text: "A mí también me escribieron agentes. Así que, técnicamente, somos colegas.",
      },
    ],
  },
  {
    id: "mcp",
    section: "agentes",
    layout: "tiles",
    title: "Las manos del agente",
    sub: "Con MCP usa las mismas herramientas que yo.",
    tiles: [
      {
        title: "Un navegador",
        body: "Playwright: abre la página, toca y saca capturas. Las de hoy las sacó un agente.",
      },
      { title: "La base y los deploys", body: "Neon y Vercel: la base, las variables, los logs." },
      { title: "GitHub", body: "PRs, CI y reviews, con gh." },
      { title: "Un worktree por agente", body: "T3 Code los orquesta: cada tarea en su copia, en paralelo." },
    ],
    steps: 4,
    seconds: 40,
    owy: "Las herramientas que usan los agentes por MCP: un navegador con Playwright, Neon y Vercel, GitHub, y T3 Code que orquesta un worktree por agente.",
  },
  {
    id: "learned-agents",
    section: "agentes",
    layout: "points",
    title: "Lo que aprendí",
    kicker: "Trabajando con agentes",
    points: [
      { title: "El agente escribe; yo decido", body: "Qué construir, qué borrar y cuándo parar sigue siendo mío." },
      { title: "Pruebas y capturas, no fe", body: "Cada PR trae tests y fotos de cada pantalla antes del merge." },
      { title: "Chico y revisable", body: "Un PR por idea. Si no lo puedo revisar, no entra." },
    ],
    steps: 3,
    seconds: 35,
    owy: "Lo que aprendió Agustín trabajando con agentes: el agente escribe y él decide, pruebas y capturas en vez de fe, y PRs chicos que se puedan revisar.",
  },

  // --- Cierre (18:15–19:15) ---
  {
    id: "takeaways",
    section: "cierre",
    layout: "points",
    title: "Para llevarse",
    kicker: "Para llevarse",
    points: [
      {
        title: "Una API, un bus, muchas pantallas",
        body: "Lo difícil se escribe una vez. Cada pantalla nueva sólo escucha.",
      },
      { title: "Owy es un usuario más", body: "Su llave, sus permisos, la misma API. Nada especial: por eso anda." },
      { title: "Los agentes construyen; las personas deciden", body: "Y la comunidad lo usa el mismo día." },
    ],
    steps: 3,
    seconds: 30,
    owy: "Lo que se llevan: una API y un bus para muchas pantallas, que vos sos un usuario más, y que los agentes construyen pero las personas deciden.",
  },
  {
    id: "join",
    section: "cierre",
    layout: "links",
    title: "Hacé tu propio Owy",
    kicker: "Es todo abierto",
    links: [
      { label: "El código de Owy", url: REPO },
      { label: "Sumate a OWU", url: SLACK },
    ],
    seconds: 15,
    owy: "Los links: tu código es abierto, en el repo de la comunidad, y el Slack de OWU para sumarse.",
  },
  {
    id: "to-qa",
    section: "cierre",
    layout: "qa",
    title: "Preguntas",
    seconds: 15,
    owy: "Arranca la ronda de preguntas: en pantalla las preguntas del público, ordenadas por votos.",
    cues: [
      {
        label: "Owy lee la más votada",
        mode: "say",
        text: "La pregunta más votada es: «{top}». ¿Contestás vos, Agus, o contesto yo?",
      },
    ],
  },

  // --- Preguntas (19:15–24:15) ---
  {
    id: "qa",
    section: "preguntas",
    layout: "qa",
    title: "Preguntas y respuestas",
    seconds: 300,
    owy: "Ronda de preguntas: el público pregunta desde el celular o con el micrófono de mano. Respondé corto, a la persona que preguntó, y devolvele la palabra a Agustín.",
    cues: [
      {
        label: "Leer la más votada",
        mode: "say",
        text: "La que sigue es: «{top}».",
      },
    ],
  },

  // --- Final (24:15–24:35) ---
  {
    id: "end",
    section: "final",
    layout: "end",
    title: "Gracias",
    links: [
      { label: "Código", url: REPO },
      { label: "Slack de OWU", url: SLACK },
    ],
    seconds: 20,
    owy: "La placa final: gracias, OWU CONF 2026.",
    cues: [
      {
        label: "Despedida de Owy",
        mode: "say",
        clip: "talk-bye",
        text: "Gracias por bancarse una charla con un carpincho. Si me ven en el pasillo, tóquenme la perilla, que para eso estoy.",
      },
    ],
  },
];

const BY_ID = new Map(TALK_SLIDES.map((slide) => [slide.id, slide]));

/** A slide by id; an unknown id (a deploy that renamed one) falls back to the lobby. */
export const talkSlide = (id: string): TalkSlide => BY_ID.get(id) ?? TALK_SLIDES[0];
export const slideIndex = (id: string) => Math.max(0, TALK_SLIDES.indexOf(talkSlide(id)));
export const slideSteps = (slide: TalkSlide) => Math.max(1, slide.steps ?? 1);

export type TalkPosition = { slide: string; step: number };

/** Next build of the slide, else the first build of the next slide; null at the end. */
export function stepAfter({ slide, step }: TalkPosition): TalkPosition | null {
  const current = talkSlide(slide);
  if (step + 1 < slideSteps(current)) return { slide: current.id, step: step + 1 };
  const next = TALK_SLIDES[slideIndex(current.id) + 1];

  return next ? { slide: next.id, step: 0 } : null;
}

/** Previous build, else the previous slide fully built (going back shows what was already said). */
export function stepBefore({ slide, step }: TalkPosition): TalkPosition | null {
  const current = talkSlide(slide);
  if (step > 0) return { slide: current.id, step: Math.min(step, slideSteps(current)) - 1 };
  const previous = TALK_SLIDES[slideIndex(current.id) - 1];

  return previous ? { slide: previous.id, step: slideSteps(previous) - 1 } : null;
}

/** What the phones show on a slide: its own input, else a question for the Q&A. */
export const slideInput = (slide: TalkSlide): TalkInput => slide.input ?? { kind: "question" };

/**
 * The input key a slide's phones send and its wall reads. Questions share one key across the
 * deck (they all end up in the Q&A); a vote is per slide, and per round on "¿Humano u Owy?".
 */
export function inputKey(slide: TalkSlide, step: number): string {
  const input = slideInput(slide);
  if (input.kind === "question") return "question";
  if (input.kind === "reactions") return "reaction";
  if (input.kind === "stars") return `stars:${slide.id}`;
  return slide.layout === "vs" ? `vote:${slide.id}:${vsRound(step)}` : `vote:${slide.id}`;
}

/** "¿Humano u Owy?": each round is two builds, the vote then the reveal. */
export const vsRound = (step: number) => Math.floor(step / 2);
export const vsRevealed = (step: number) => step % 2 === 1;

/** Planned seconds per section, in deck order (the console's budget clock). */
export function sectionBudgets(): { section: TalkSection; seconds: number; first: string }[] {
  const out: { section: TalkSection; seconds: number; first: string }[] = [];
  for (const slide of TALK_SLIDES) {
    const last = out.at(-1);
    if (last?.section === slide.section) last.seconds += slide.seconds;
    else out.push({ section: slide.section, seconds: slide.seconds, first: slide.id });
  }
  return out;
}

/** When a slide starts on the plan, in seconds from the first talk slide (the lobby is before 0). */
export function plannedStart(id: string): number {
  let at = 0;
  for (const slide of TALK_SLIDES) {
    if (slide.id === id) return at;
    at += slide.seconds;
  }
  return at;
}

/** A cue's words with `{top}` filled in; null when it needs a question and there is none. */
export function cueText(cue: TalkCue, top: string | null): string | null {
  if (!cue.text.includes("{top}")) return cue.text;
  return top ? cue.text.replaceAll("{top}", top) : null;
}

/** What Owy is told about the slide on screen for a talk turn (one line, capped for the turn's attributes). */
export function talkContext(position: TalkPosition): string {
  const slide = talkSlide(position.slide);
  return `Slide ${slideIndex(slide.id) + 1}/${TALK_SLIDES.length} «${slide.title}» (${TALK_SECTIONS[slide.section].title}): ${slide.owy}`.slice(
    0,
    600
  );
}
