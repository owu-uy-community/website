import type { Expression } from "../scenes";

/**
 * «Owy, en vivo» — the open-space talk at OWU CONF 2026, given by Agustín and Owy together:
 * how the open space tool and Owy work, and how they are connected. 25 minutes, ~5 of them Q&A.
 *
 * The whole deck is ONE Owy Stage scene (`owy-charla`, params `{slide, step}`): moving between
 * slides is a params edit, never a new take, so the phone round lives for the whole talk and a
 * question sent on the second slide is still there at the Q&A. Polls and votes are layouts of
 * the same scene with their own input keys (`inputKey`), for the same reason.
 *
 * The grid slides show the board of the wall's event (the desk's event): for the talk, the demo
 * grid where the bridge's pitches land (`COMPANION_PITCH_EVENT_ID`).
 *
 * Pure data: the wall, the phones, the console and Owy's talk context all read it. What only
 * the presenter should read lives in `notes.ts` (kept out of the public stage bundle). Nothing
 * here is secret: any slide can be opened at /owy/stage/owy-charla.
 */

export const TALK_SECTIONS = {
  previa: { title: "Previa", color: "#FBF5E7" },
  apertura: { title: "Apertura", color: "#F5BB03" },
  openspace: { title: "El open space", color: "#0162C8" },
  owy: { title: "Conocé a Owy", color: "#F5BB03" },
  conexion: { title: "Cómo se conectan", color: "#0162C8" },
  wifi: { title: "El wifi", color: "#F5BB03" },
  envivo: { title: "En vivo", color: "#0162C8" },
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
    | { layout: "devices"; devices: { name: string; size: string; screen: number; specs: string[] }[] }
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
    | { layout: "qa" }
    | { layout: "rating" }
    | { layout: "photo-op" }
    | { layout: "end"; links: { label: string; url: string }[] }
  );
export type TalkLayout = TalkSlide["layout"];

const REPO = "https://github.com/owu-uy-community/website";
const SLACK = "https://slack.owu.uy/";

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

  // --- Apertura (0:00–1:20) ---
  {
    id: "wake",
    section: "apertura",
    layout: "face",
    title: "Owy se despierta",
    seconds: 35,
    pip: false,
    owy: "Arranca la charla: tu cara ocupa toda la pantalla. Hablás vos primero, antes que Agustín.",
    cues: [
      {
        label: "Owy abre la charla",
        mode: "say",
        auto: true,
        clip: "talk-wake",
        text: "Hola, soy Owy. Agustín me pidió que arranque yo, porque a mí no me tiembla la voz. Hoy les contamos cómo funciona la grilla del open space, qué hago yo ahí, y cómo el wifi casi me deja mudo. ¿Arrancás, Agus?",
      },
    ],
  },
  {
    id: "title",
    section: "apertura",
    layout: "title",
    title: "Owy, en vivo",
    kicker: "Open space de OWU CONF 2026",
    subtitle: "Cómo el open space y un carpincho trabajan juntos.",
    people: [
      { name: "Agustín Tornielli", role: "el humano" },
      { name: "Owy", role: "el carpincho" },
    ],
    seconds: 45,
    owy: "La portada: «Owy, en vivo. Cómo el open space y un carpincho trabajan juntos». Agustín y vos, co-presentadores.",
  },

  // --- El open space (1:20–5:05) ---
  {
    id: "paper",
    section: "openspace",
    layout: "photos",
    title: "El open space, en papel",
    photos: [
      { src: "/images/conf/openspace/galeria-10.webp", alt: "La grilla de papel pegada en el vidrio, en 2024" },
      { src: "/images/conf/openspace/galeria-02.webp", alt: "Manos escribiendo tarjetas de charlas" },
    ],
    captions: ["La agenda la arma la gente, en post-its.", "Y después alguien la pasa a mano."],
    steps: 2,
    seconds: 45,
    owy: "Fotos del open space de otros años: la grilla de post-its en papel, y alguien que después la pasa a mano.",
  },
  {
    id: "grid",
    section: "openspace",
    layout: "board",
    title: "La grilla, en vivo",
    sub: "La misma en el admin, el celular, los kiosks y esta pantalla.",
    seconds: 75,
    owy: "La grilla del open space en vivo: salas por bloques, con las tarjetas de las charlas. Es la misma que usa el staff en el admin y que ve la gente en el celular, en los kiosks y en esta pantalla.",
  },
  {
    id: "ai",
    section: "openspace",
    layout: "points",
    title: "La grilla piensa un poco",
    kicker: "Con AI, donde ayuda",
    points: [
      {
        title: "Del post-it a la tarjeta",
        body: "Una foto, y Gemini Flash lee la letra: título, quién, si precisa tele.",
      },
      {
        title: "Sugerir con AI",
        body: "Un modelo de decisión contesta sí o no: ¿mismo tema? ¿sala parecida? El lugar sale de una cuenta.",
      },
      { title: "«Para vos»", body: "Cada tarjeta se etiqueta sola, por tema y formato, para recomendarte charlas." },
    ],
    steps: 3,
    seconds: 60,
    owy: "Dónde ayuda la AI en la grilla: leer la foto de un post-it y armar la tarjeta, sugerir el lugar con un modelo que contesta sí o no, y etiquetar cada charla para recomendarla.",
  },
  {
    id: "poll-bathroom",
    section: "openspace",
    layout: "poll",
    title: "Encuesta",
    input: {
      kind: "vote",
      prompt: "¿Cuántas veces te preguntaron «¿dónde es el baño?» en un evento?",
      options: ["Nunca", "De 1 a 5", "De 5 a 20", "Perdí la cuenta"],
    },
    reveal: "Por eso existe Owy.",
    steps: 2,
    seconds: 45,
    owy: "Una encuesta en vivo desde los celulares: cuántas veces les preguntaron dónde es el baño en un evento.",
    cues: [
      {
        label: "Remate de la encuesta",
        mode: "say",
        clip: "talk-poll",
        text: "Yo esa pregunta la contesto con la misma alegría la vez mil. Ventajas de ser un bot.",
      },
    ],
  },

  // --- Conocé a Owy (5:05–7:05) ---
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
      { label: "La pantalla", detail: "esto que están viendo" },
      { label: "El panel", detail: "/admin/owy, en el celular" },
    ],
    steps: 6,
    seconds: 45,
    owy: "Un diagrama: un solo cerebro en el medio y tus cuerpos alrededor: Slack, Telegram, la perilla, la pantalla y el panel del staff.",
  },
  {
    id: "demo-now",
    section: "owy",
    layout: "live",
    title: "En vivo: ¿qué hay ahora?",
    kicker: "Demo en vivo",
    ask: "Owy, ¿qué hay ahora en el open space?",
    tools: ["event_now", "get_openspace_board"],
    seconds: 75,
    owy: "Primera demo en vivo: Agustín te pregunta qué hay ahora en el open space. Usá tus tools, contestá corto y con datos reales.",
    cues: [
      {
        label: "Preguntar por texto (si falla la voz)",
        mode: "ask",
        text: "¿Qué hay ahora en el open space? Contalo en dos frases.",
      },
    ],
  },

  // --- Cómo se conectan (7:05–9:10) ---
  {
    id: "tools",
    section: "conexion",
    layout: "tiles",
    title: "Owy usa la misma API que vos",
    sub: "29 tools. Los mismos archivos en Slack, Telegram y la voz.",
    tiles: [
      {
        title: "La grilla",
        body: "get_openspace_board · event_now · create_track · move_track · digitize_board_photo",
        code: true,
      },
      {
        title: "Las salas y el staff",
        body: "set_room_status · cast_track · countdown_control · announce_to_staff",
        code: true,
      },
      { title: "Su propia llave", body: "x-api-key → un usuario bot, con permisos acotados", code: true },
      {
        title: "Sólo lo que vos podés",
        body: "Owy chequea que quien le habla tenga el permiso. La API lo chequea otra vez.",
      },
    ],
    steps: 4,
    seconds: 50,
    owy: "Tus tools: leer y mover la grilla, leer la foto del tablero, las salas, el staff. Entrás a la API de OWU con tu propia llave, como un usuario bot, y sólo hacés lo que la persona que te habla tiene permiso de hacer; la API lo vuelve a chequear.",
  },
  {
    id: "hub",
    section: "conexion",
    layout: "hub",
    title: "Una API, un bus",
    sub: "Todos escriben en el mismo lugar. Todos escuchan el mismo canal.",
    writers: [
      { label: "El staff", detail: "el admin, en el celular", tone: "people" },
      { label: "Owy", detail: "Slack, Telegram y la voz", tone: "owy" },
      { label: "La perilla", detail: "el modo pitch", tone: "owy" },
      { label: "Una foto", detail: "del post-it a la tarjeta", tone: "people" },
    ],
    core: [
      { label: "owu.uy", detail: "oRPC · Postgres" },
      { label: "Realtime", detail: "card_change" },
    ],
    readers: [
      { label: "El wall", detail: "grilla, mapa, salas" },
      { label: "Celulares", detail: "conf.owu.uy/openspace" },
      { label: "Kiosks", detail: "la puerta de cada sala" },
      { label: "La perilla", detail: "te muestra tu tarjeta" },
    ],
    steps: 3,
    seconds: 75,
    owy: "Cómo se conecta todo: el staff, vos y las fotos escriben en la misma API de owu.uy; cada cambio sale por un canal en tiempo real, y el wall, los celulares, los kiosks y la perilla lo escuchan al mismo tiempo.",
  },

  // --- El wifi (9:10–14:05) ---
  {
    id: "wifi",
    section: "wifi",
    layout: "wifi",
    title: "La noche anterior",
    sub: "El wifi de la perilla, medido el viernes a la noche.",
    lanes: [
      { label: "El router", rtt: "5 ms", loss: "0 %", ok: true },
      { label: "La perilla", rtt: "200–1500 ms", loss: "7–75 %", ok: false },
    ],
    verdict: "El router andaba. La perilla, no.",
    steps: 2,
    seconds: 50,
    owy: "Lo que midieron la noche anterior: el router contestaba en 5 milisegundos sin perder nada; tu perilla tardaba entre 200 y 1500 milisegundos y perdía entre el 7 y el 75 por ciento de los paquetes.",
  },
  {
    id: "wifi-bugs",
    section: "wifi",
    layout: "bugs",
    title: "Lo que el wifi rompía",
    bugs: [
      {
        title: "El micrófono llegaba vacío",
        body: "La placa mandaba el audio por wifi. Perdiendo hasta tres de cada cuatro paquetes, Owy escuchaba silencio.",
      },
      { title: "Toques con demora", body: "Tocabas la perilla y Owy se enteraba de 3 a 11 segundos después." },
      { title: "«Ups, me trabé»", body: "Un segundo toque cancelaba el turno, y la cara decía que se había roto." },
      {
        title: "El sospechoso: el USB-C de la Mac",
        body: "La perilla estaba enchufada a la Mac, y el USB 3 mete ruido justo en los 2,4 GHz del wifi.",
      },
    ],
    steps: 4,
    seconds: 50,
    owy: "Lo que el wifi malo rompía: el micrófono llegaba vacío, los toques llegaban segundos tarde, un segundo toque parecía un error, y el sospechoso era el USB de la Mac, que mete ruido en la banda del wifi.",
    cues: [{ label: "Chiste del silencio", mode: "say", clip: "talk-bugs", text: "Esa fue mi noche más silenciosa." }],
  },
  {
    id: "split",
    section: "wifi",
    layout: "split",
    title: "Que el audio no viaje",
    sub: "Por el wifi, mensajes chicos. El audio se queda en la Mac.",
    sides: [
      {
        title: "Antes",
        device: { label: "La placa", detail: "mic y parlante" },
        mac: { label: "La Mac", detail: "el bridge" },
        wire: "audio a 16 kHz, ida y vuelta",
        heavy: true,
        facts: [
          "32.000 bytes de audio por segundo",
          "dos placas, las dos con micrófono",
          "ESPHome con componentes parcheados",
        ],
      },
      {
        title: "Ahora",
        device: { label: "La perilla", detail: "cara y botón" },
        mac: { label: "La Mac", detail: "mic DJI y parlantes" },
        wire: "un toque, una cara, los labios",
        heavy: false,
        facts: ["un toque es un número; la cara, una palabra", "una sola placa", "ESPHome de fábrica"],
      },
    ],
    steps: 2,
    seconds: 60,
    owy: "La decisión: antes la placa mandaba audio por el wifi, ida y vuelta; ahora tu perilla es una cara y un botón, y por el wifi viajan mensajes chicos. El audio se queda en la Mac, con el micrófono inalámbrico y los parlantes de la sala.",
  },
  {
    id: "deleted",
    section: "wifi",
    layout: "numbers",
    title: "Simplificar es borrar",
    stats: [
      { value: 19, suffix: " mil", label: "líneas borradas" },
      { value: 3, suffix: " mil", label: "líneas nuevas" },
      { value: 122, label: "archivos, un solo PR" },
      { value: 1, label: "placa (eran dos)" },
      { value: 0, label: "bytes de audio por el wifi" },
      { value: 0, label: "componentes parcheados" },
    ],
    seconds: 35,
    owy: "Lo que dejó la simplificación: diecinueve mil líneas borradas y tres mil nuevas, en un solo PR; una placa en vez de dos, cero audio por el wifi y cero componentes parcheados.",
    cues: [
      {
        label: "Chiste de los oídos",
        mode: "say",
        clip: "talk-gone",
        text: "Me sacaron los oídos y la boca, y ahora escucho mejor que nunca.",
      },
    ],
  },
  {
    id: "inside",
    section: "wifi",
    layout: "diagram",
    title: "Un turno, por dentro",
    live: true,
    nodes: [
      { id: "knob", label: "La perilla", detail: "un toque y la cara" },
      { id: "mac", label: "La Mac", detail: "bridge en Node, mic DJI y PA" },
      { id: "voice", label: "Oídos y boca", detail: "Gemini Live por AI Gateway" },
      { id: "brain", label: "Cerebro", detail: "eve: memoria, tools, skills" },
      { id: "api", label: "API de OWU", detail: "oRPC: grilla, salas, staff" },
      { id: "bus", label: "Realtime", detail: "WebSocket en Vercel + Redis" },
      { id: "wall", label: "Pantallas", detail: "wall, kiosks y celulares" },
    ],
    steps: 7,
    seconds: 60,
    owy: "El diagrama de un turno de voz, ahora: un toque en la perilla, el bridge en la Mac con el micrófono y los parlantes, Gemini Live como oídos y boca, eve como cerebro, la API de OWU, el realtime y las pantallas. Las cajas se prenden mientras hablás.",
    cues: [
      {
        label: "Owy explica el diagrama",
        mode: "ask",
        text: "Contá en treinta segundos cómo funcionás ahora por dentro, recorriendo el diagrama que está en pantalla.",
      },
    ],
  },
  {
    id: "ladder",
    section: "wifi",
    layout: "ladder",
    title: "Y si internet igual falla",
    rungs: [
      { title: "Tiempo real", body: "Gemini Live: escucha y habla en un solo paso." },
      { title: "Tiempo real de respaldo", body: "GPT Realtime o Grok, si Gemini no conecta." },
      { title: "Cascada", body: "Transcribir, pensar, hablar. Más lento, más firme." },
      { title: "Sin internet", body: "Un audio grabado en la Mac y el QR de la grilla en la perilla." },
    ],
    steps: 4,
    seconds: 40,
    owy: "Tus planes de respaldo para la voz: tiempo real, tiempo real de respaldo con otro modelo, cascada de transcribir-pensar-hablar, y sin internet un audio grabado con el QR de la grilla.",
    cues: [
      {
        label: "Chiste de los planes B",
        mode: "say",
        clip: "talk-ladder",
        text: "Tengo plan B, C y D. Más que varios de ustedes para el almuerzo.",
      },
    ],
  },

  // --- En vivo (14:05–17:35) ---
  {
    id: "pitch-flow",
    section: "envivo",
    layout: "flow",
    title: "Del pitch a la grilla",
    stations: [
      { label: "Tocás la perilla", detail: "sensor.taps + 1" },
      { label: "La Mac te escucha", detail: "ffmpeg · mic DJI" },
      { label: "Owy arma la tarjeta", detail: "generateText + Output.object" },
      { label: "Elige el lugar", detail: "jev: ¿mismo tema? ¿sala parecida?" },
      { label: "Queda en la grilla", detail: "tracks.createPlaced" },
      { label: "Lo ven todas las pantallas", detail: "card_change → wall · celulares · perilla" },
    ],
    steps: 6,
    seconds: 60,
    owy: "Qué pasa en un pitch, paso a paso: un toque, la Mac escucha, armás la tarjeta con el título y el nombre, un modelo de decisión elige el lugar, la tarjeta queda en la grilla y todas las pantallas se enteran por el realtime.",
  },
  {
    id: "pitch",
    section: "envivo",
    layout: "board",
    title: "En vivo: proponé tu charla",
    sub: "Mirá la grilla: tu tarjeta aparece sola.",
    how: ["Tocá la perilla", "Contá tu charla en 20 segundos", "Tocá de nuevo"],
    seconds: 150,
    owy: "Segunda demo en vivo: alguien del público te propone una charla en modo pitch, vos la ubicás en la grilla de prueba, y la tarjeta aparece en la grilla que está en pantalla.",
    cues: [
      {
        label: "Owy invita al pitch",
        mode: "say",
        clip: "talk-pitch",
        text: "¡Me encanta esta parte! Tocá la perilla, contame tu charla en veinte segundos, y yo te la ubico en la grilla.",
      },
    ],
  },

  // --- Cierre (17:35–18:55) ---
  {
    id: "learned",
    section: "cierre",
    layout: "points",
    title: "Lo que aprendimos",
    kicker: "Para llevarse",
    points: [
      { title: "Diseñá para el wifi de la conferencia", body: "No para el de tu casa. Que viajen mensajes, no audio." },
      {
        title: "Lo simple aguanta",
        body: "Una placa, firmware de fábrica, el audio en la Mac. Menos código, menos fallas.",
      },
      {
        title: "Owy es un usuario más",
        body: "La misma API, los mismos permisos, el mismo bus. Lo difícil se escribe una vez.",
      },
    ],
    steps: 3,
    seconds: 45,
    owy: "Lo que aprendieron: diseñar para el wifi de la conferencia, que lo simple aguanta, y que vos sos un usuario más de la misma API.",
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
    seconds: 20,
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

  // --- Preguntas (18:55–23:55) ---
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

  // --- Final (23:55–24:15) ---
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
