import type { Expression } from "../scenes";

/**
 * «Owy, en vivo» — the open-space talk at OWU CONF 2026, given by Agustín and Owy together.
 *
 * The whole deck is ONE Owy Stage scene (`owy-charla`, params `{slide, step}`): moving between
 * slides is a params edit, never a new take, so the phone round lives for the whole talk and a
 * question sent on the second slide is still there at the Q&A. Polls and votes are layouts of
 * the same scene with their own input keys (`inputKey`), for the same reason.
 *
 * Pure data: the wall, the phones, the console and Owy's talk context all read it. What only
 * the presenter should read lives in `notes.ts` (kept out of the public stage bundle). Nothing
 * here is secret: any slide can be opened at /owy/stage/owy-charla.
 */

export const TALK_SECTIONS = {
  previa: { title: "Previa", color: "#FBF5E7" },
  apertura: { title: "Apertura", color: "#F5BB03" },
  problema: { title: "El problema", color: "#0162C8" },
  owy: { title: "Conocé a Owy", color: "#F5BB03" },
  historia: { title: "La historia", color: "#0162C8" },
  adentro: { title: "Por dentro", color: "#F5BB03" },
  cuerpos: { title: "Los cuerpos", color: "#0162C8" },
  juego: { title: "¿Humano u Owy?", color: "#F5BB03" },
  cierre: { title: "Cierre", color: "#0162C8" },
  preguntas: { title: "Preguntas", color: "#F5BB03" },
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
export const DIAGRAM_NODES = ["mic", "device", "bridge", "voice", "brain", "api", "wall"] as const;
export type DiagramNode = (typeof DIAGRAM_NODES)[number];

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
    | { layout: "tiles"; tiles: { icon: string; title: string; body: string }[] }
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

  // --- Apertura (0:00–1:30) ---
  {
    id: "wake",
    section: "apertura",
    layout: "face",
    title: "Owy se despierta",
    seconds: 40,
    pip: false,
    owy: "Arranca la charla: tu cara ocupa toda la pantalla. Hablás vos primero, antes que Agustín.",
    cues: [
      {
        label: "Owy abre la charla",
        mode: "say",
        auto: true,
        clip: "talk-wake",
        text: "Hola, soy Owy. Agustín me pidió que arranque yo, porque a mí no me tiembla la voz. Esta charla la damos entre los dos: él pone las manos, yo pongo la voz. ¿Arrancás, Agus?",
      },
    ],
  },
  {
    id: "title",
    section: "apertura",
    layout: "title",
    title: "Owy, en vivo",
    kicker: "Open space de OWU CONF 2026",
    subtitle: "Un bot hecho por la comunidad, con cuerpo.",
    people: [
      { name: "Agustín Tornielli", role: "el humano" },
      { name: "Owy", role: "el carpincho" },
    ],
    seconds: 50,
    owy: "La portada: «Owy, en vivo. Un bot hecho por la comunidad, con cuerpo». Agustín y vos, co-presentadores.",
  },

  // --- El problema (1:30–3:30) ---
  {
    id: "questions",
    section: "problema",
    layout: "bubbles",
    title: "Un sábado en una conf",
    bubbles: [
      "¿Dónde es la sala 3?",
      "¿A qué hora es el almuerzo?",
      "¿Hay wifi?",
      "¿Quién da la charla de las 16?",
      "¿Dónde dejo el post-it?",
      "¿Hay mate?",
    ],
    punchline: "Siempre las mismas preguntas. Siempre a la misma persona del staff.",
    steps: 7,
    seconds: 40,
    owy: "Las preguntas que el staff contesta cien veces en una conf: salas, horarios, wifi, quién da cada charla.",
  },
  {
    id: "board",
    section: "problema",
    layout: "photos",
    title: "El open space, en papel",
    photos: [
      { src: "/images/conf/openspace/galeria-10.webp", alt: "La grilla de papel pegada en el vidrio, en 2024" },
      { src: "/images/conf/openspace/galeria-02.webp", alt: "Manos escribiendo tarjetas de charlas" },
    ],
    captions: ["La agenda la arma la gente, en papel.", "Y después alguien la pasa a mano."],
    steps: 2,
    seconds: 40,
    owy: "Fotos del open space: la grilla de post-its en papel, y alguien que después la pasa a mano.",
  },
  {
    id: "why",
    section: "problema",
    layout: "statement",
    title: "Por qué Owy",
    kicker: "Por qué lo hicimos",
    // [A] Agustín: tu frase. Corta, en primera persona.
    text: "Quería que el staff disfrute la conf, y que las preguntas de siempre las conteste alguien que nunca se cansa.",
    by: "Agustín",
    seconds: 20,
    owy: "Agustín cuenta por qué arrancó con Owy.",
  },
  {
    id: "poll-bathroom",
    section: "problema",
    layout: "poll",
    title: "Encuesta",
    input: {
      kind: "vote",
      prompt: "¿Cuántas veces te preguntaron «¿dónde es el baño?» en un evento?",
      options: ["Nunca", "De 1 a 5", "De 5 a 20", "Perdí la cuenta"],
    },
    reveal: "Por eso existe Owy.",
    steps: 2,
    seconds: 20,
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

  // --- Conocé a Owy (3:30–6:00) ---
  {
    id: "bodies",
    section: "owy",
    layout: "orbit",
    title: "Un cerebro, muchos cuerpos",
    core: { label: "Owy", detail: "un solo cerebro (eve)" },
    bodies: [
      { label: "Slack", detail: "el canal de la conf" },
      { label: "Telegram", detail: "para el staff" },
      { label: "Web", detail: "hablás desde el navegador" },
      { label: "Owy físico", detail: "la pantallita y la perilla" },
      { label: "La pantalla", detail: "esto que están viendo" },
    ],
    steps: 6,
    seconds: 45,
    owy: "Un diagrama: un solo cerebro en el medio y tus cuerpos alrededor: Slack, Telegram, la web, el Owy físico y la pantalla.",
  },
  {
    id: "does",
    section: "owy",
    layout: "tiles",
    title: "Qué hace Owy",
    tiles: [
      { icon: "💬", title: "Responde sobre el evento", body: "Y si no sabe, lo dice. Nunca inventa." },
      { icon: "🗂️", title: "La grilla en vivo", body: "Qué hay ahora, dónde y quién." },
      { icon: "📸", title: "Lee la foto del tablero", body: "Del post-it a la grilla digital." },
      { icon: "🧑‍🤝‍🧑", title: "Coordina al staff", body: "Tareas, avisos y turnos." },
      { icon: "🎤", title: "Modo pitch", body: "Proponé tu charla hablándole." },
      { icon: "⏰", title: "Avisos del día", body: "Apertura, bloques y cierre, solo." },
    ],
    steps: 6,
    seconds: 45,
    owy: "Lo que hacés: responder sobre el evento sin inventar, la grilla en vivo, leer la foto del tablero, coordinar al staff, el modo pitch y los avisos automáticos del día.",
  },
  {
    id: "demo-now",
    section: "owy",
    layout: "live",
    title: "En vivo: ¿qué hay ahora?",
    kicker: "Demo en vivo",
    ask: "Owy, ¿qué hay ahora en el open space?",
    tools: ["event_now", "get_board"],
    seconds: 60,
    owy: "Primera demo en vivo: Agustín te pregunta qué hay ahora en el open space. Usá tus tools, contestá corto y con datos reales.",
    cues: [
      {
        label: "Preguntar por texto (si falla la voz)",
        mode: "ask",
        text: "¿Qué hay ahora en el open space? Contalo en dos frases.",
      },
    ],
  },

  // --- La historia (6:00–8:00) ---
  {
    id: "timeline",
    section: "historia",
    layout: "timeline",
    title: "De bot a mascota",
    events: [
      { date: "17 ago", title: "Owy nace", body: "Un bot en Slack y Telegram, hecho con eve." },
      { date: "ago", title: "Lee el tablero", body: "Le mandás la foto de los post-its y los carga." },
      { date: "4 sep", title: "Primera palabra", body: "El primer Owy físico habla de verdad." },
      { date: "12 sep", title: "La pantalla", body: "Owy Stage: escenas, cara y celulares." },
      { date: "19 sep", title: "La perilla", body: "Un segundo cuerpo, que gira y vibra." },
      { date: "20 sep", title: "Un solo cerebro", body: "La voz pasa a pensar con eve." },
      { date: "7 oct", title: "Modo pitch", body: "Proponés tu charla hablando." },
      { date: "31 oct", title: "Planes B", body: "Por si el wifi de la conf falla." },
      { date: "7 nov", title: "Hoy", body: "Acá, con ustedes." },
    ],
    steps: 9,
    seconds: 50,
    owy: "Tu historia en una línea de tiempo: naciste el 17 de agosto en Slack y Telegram; en septiembre hablaste por primera vez con cuerpo, llegó la pantalla y la perilla; en octubre el modo pitch y los planes B para el wifi; hoy, 7 de noviembre, la charla.",
  },
  {
    id: "bugs",
    section: "historia",
    layout: "bugs",
    title: "Bugs que nos marcaron",
    bugs: [
      {
        title: "El micrófono mudo",
        body: "Días creyendo que era el mic. Era el reloj compartido del bus de audio. Y encima se subía el firmware viejo.",
      },
      { title: "La perilla que no es perilla", body: "No es un encoder: son dos botones disfrazados." },
      { title: "macOS no te deja hablar con tu red", body: "El permiso de red local bloqueaba al bridge." },
      { title: "La Mac se dormía", body: "En la mitad de cada prueba larga. caffeinate -i." },
      { title: "La vibración que se escuchaba", body: "El motor háptico se metía en el micrófono." },
    ],
    steps: 5,
    seconds: 45,
    owy: "El muro de bugs: el micrófono mudo por el reloj del bus de audio, la perilla que en realidad son dos botones, macOS bloqueando la red local, la Mac que se dormía en las pruebas y la vibración que se colaba en el micrófono.",
    cues: [
      { label: "Chiste del micrófono", mode: "say", clip: "talk-bugs", text: "Esa fue mi semana más silenciosa." },
    ],
  },
  {
    id: "numbers",
    section: "historia",
    layout: "numbers",
    title: "Owy en números",
    // Re-count before the talk (commands in the plan).
    stats: [
      { value: 214, label: "escenas para la pantalla" },
      { value: 30, label: "tools" },
      { value: 2, label: "cuerpos físicos" },
      { value: 4, label: "caminos para la voz" },
      { value: 43, suffix: " mil", label: "líneas de código" },
      { value: 100, suffix: " %", label: "comunidad" },
    ],
    seconds: 25,
    owy: "Tus números: más de doscientas escenas de pantalla, treinta tools, dos cuerpos físicos, cuatro caminos para la voz, unas cuarenta y tres mil líneas de código, cien por ciento comunidad.",
    cues: [
      {
        label: "Chiste de la esquina",
        mode: "say",
        clip: "talk-numbers",
        text: "Doscientas escenas, y a mí igual me ponen en la esquina.",
      },
    ],
  },

  // --- Por dentro (8:00–11:30) ---
  {
    id: "inside",
    section: "adentro",
    layout: "diagram",
    title: "Por dentro",
    live: false,
    nodes: [
      { id: "mic", label: "Micrófono", detail: "el del Owy o el de Agustín" },
      { id: "device", label: "Owy físico", detail: "ESP32-S3 con ESPHome" },
      { id: "bridge", label: "Bridge", detail: "Node: se hace pasar por Home Assistant" },
      { id: "voice", label: "Oídos y boca", detail: "Gemini Live por AI Gateway" },
      { id: "brain", label: "Cerebro", detail: "eve: sesiones, tools, skills" },
      { id: "api", label: "API de OWU", detail: "oRPC: grilla, staff, pantalla" },
      { id: "wall", label: "Pantalla", detail: "Owy Stage por WebSocket" },
    ],
    steps: 7,
    seconds: 25,
    owy: "El diagrama de cómo funcionás: micrófono, el Owy físico con ESPHome, el bridge en Node que se hace pasar por Home Assistant, Gemini Live como oídos y boca, eve como cerebro, la API de OWU y la pantalla.",
  },
  {
    id: "inside-live",
    section: "adentro",
    layout: "diagram",
    title: "En vivo: cómo funciono",
    live: true,
    nodes: [
      { id: "mic", label: "Micrófono", detail: "el del Owy o el de Agustín" },
      { id: "device", label: "Owy físico", detail: "ESP32-S3 con ESPHome" },
      { id: "bridge", label: "Bridge", detail: "Node: se hace pasar por Home Assistant" },
      { id: "voice", label: "Oídos y boca", detail: "Gemini Live por AI Gateway" },
      { id: "brain", label: "Cerebro", detail: "eve: sesiones, tools, skills" },
      { id: "api", label: "API de OWU", detail: "oRPC: grilla, staff, pantalla" },
      { id: "wall", label: "Pantalla", detail: "Owy Stage por WebSocket" },
    ],
    seconds: 70,
    owy: "Segunda demo en vivo, sobre el mismo diagrama: las cajas se prenden mientras contestás. Agustín te pide que cuentes cómo funcionás por dentro: en treinta segundos, recorriendo el diagrama de izquierda a derecha.",
    cues: [
      {
        label: "Owy explica el diagrama",
        mode: "ask",
        text: "Contá en treinta segundos cómo funcionás por dentro, recorriendo el diagrama que está en pantalla.",
      },
    ],
  },
  {
    id: "ladder",
    section: "adentro",
    layout: "ladder",
    title: "Cuando el wifi falla",
    rungs: [
      { title: "Tiempo real", body: "Gemini Live: escucha y habla en un solo paso." },
      { title: "Tiempo real de respaldo", body: "Otro modelo, por si el primero no contesta." },
      { title: "Cascada", body: "Transcribir, pensar, hablar. Más lento, más firme." },
      { title: "Sin internet", body: "Un audio grabado y el QR de la grilla." },
    ],
    steps: 4,
    seconds: 50,
    owy: "Tus planes de respaldo para la voz: tiempo real, tiempo real de respaldo, cascada de transcribir-pensar-hablar, y sin internet un audio grabado con el QR de la grilla.",
    cues: [
      {
        label: "Chiste de los planes B",
        mode: "say",
        clip: "talk-ladder",
        text: "Tengo plan B, C y D. Más que varios de ustedes para el almuerzo.",
      },
    ],
  },
  {
    id: "decisions",
    section: "adentro",
    layout: "points",
    title: "Tres decisiones",
    kicker: "Lo que decidimos",
    points: [
      { title: "Firmware estándar", body: "ESPHome tal cual, y la magia en un bridge propio en Node." },
      { title: "Un solo cerebro", body: "La misma memoria y las mismas tools en Slack, Telegram y la voz." },
      { title: "Nunca inventar", body: "Los datos vivos salen de tools; el resto, de un knowledge curado." },
    ],
    steps: 3,
    seconds: 45,
    owy: "Tres decisiones de diseño: firmware estándar con un bridge propio, un solo cerebro para todos los canales, y nunca inventar.",
  },
  {
    id: "limits",
    section: "adentro",
    layout: "points",
    title: "Lo que Owy todavía no puede",
    kicker: "Seamos honestos",
    points: [
      { title: "No lo podés interrumpir", body: "Mientras habla, no escucha." },
      { title: "No se acuerda de vos mañana", body: "Las charlas en el stand se olvidan a los tres minutos." },
      { title: "A veces piensa un rato", body: "Unos segundos cuando va a buscar datos." },
    ],
    steps: 3,
    seconds: 20,
    owy: "Tus límites, con honestidad: no te pueden interrumpir mientras hablás, en el stand te olvidás de la gente a los tres minutos, y a veces tardás unos segundos en buscar datos.",
  },

  // --- Los cuerpos (11:30–13:30) ---
  {
    id: "devices",
    section: "cuerpos",
    layout: "devices",
    title: "Los cuerpos de Owy",
    devices: [
      {
        name: "La pantallita",
        size: "1,75 pulgadas",
        screen: 466,
        specs: ["AMOLED redonda, táctil", "micrófonos y parlante", "caja de aluminio"],
      },
      {
        name: "La perilla",
        size: "1,8 pulgadas",
        screen: 360,
        specs: ["gira y vibra", "micrófono, sin parlante", "dos chips adentro"],
      },
    ],
    steps: 2,
    seconds: 40,
    owy: "Tus dos cuerpos: la pantallita AMOLED redonda de 1,75 pulgadas con micrófonos y parlante, y la perilla de 1,8 que gira y vibra. Agustín las muestra.",
  },
  {
    id: "faces",
    section: "cuerpos",
    layout: "faces",
    title: "La cara de Owy",
    expressions: ["happy", "curious", "surprised", "thinking", "playful", "empathetic", "excited"],
    seconds: 20,
    pip: false,
    owy: "Tu cara en grande, pasando por tus expresiones: contento, curioso, sorprendido, pensando, pícaro, empático, entusiasmado.",
    cues: [
      {
        label: "Owy presenta sus caras",
        mode: "say",
        clip: "talk-faces",
        text: "Tengo una cara para cada frase. Esta es la de contento, esta la de curioso… y esta, la que pongo cuando el wifi anda mal.",
      },
    ],
  },
  {
    id: "pitch",
    section: "cuerpos",
    layout: "pitch",
    title: "En vivo: modo pitch",
    how: ["Tocá la perilla", "Contá tu charla en 20 segundos", "Tocá de nuevo", "Owy la ubica en la grilla"],
    seconds: 60,
    pip: false,
    owy: "Tercera demo en vivo: alguien del público te propone una charla en modo pitch y vos la ubicás en la grilla de prueba.",
    cues: [
      {
        label: "Owy invita al pitch",
        mode: "say",
        clip: "talk-pitch",
        text: "¡Me encanta esta parte! Tocá la perilla, contame tu charla en veinte segundos, y yo te la ubico en la grilla.",
      },
    ],
  },

  // --- ¿Humano u Owy? (13:30–14:30) ---
  {
    id: "vs",
    section: "juego",
    layout: "vs",
    title: "¿Humano u Owy?",
    // [A] Drafts: before the talk, the "owy" ones must really come from Owy and the "human" ones from Agustín.
    rounds: [
      { text: "Un open space es una conferencia donde la agenda la escribe la gente que vino.", author: "human" },
      { text: "Mate en la mano, post-it en la otra: la agenda se escribe sola.", author: "owy" },
      {
        text: "El wifi de las conferencias es como el colectivo: llega, pero nunca cuando lo necesitás.",
        author: "owy",
      },
    ],
    input: { kind: "vote", prompt: "¿Quién lo escribió?", options: ["Humano", "Owy"] },
    steps: 6,
    seconds: 60,
    owy: "Un juego: en pantalla aparecen frases, el público vota desde el celular si las escribió un humano o vos, y después se revela.",
    cues: [
      { label: "Revelación: Owy", mode: "say", clip: "talk-vs-owy", text: "Ese fui yo. Se nota el talento." },
      {
        label: "Revelación: humano",
        mode: "say",
        clip: "talk-vs-human",
        text: "Ese fue Agustín. Se nota el esfuerzo.",
      },
    ],
  },

  // --- Cierre (14:30–15:30) ---
  {
    id: "learned",
    section: "cierre",
    layout: "points",
    title: "Lo que aprendimos",
    kicker: "Para llevarse",
    points: [
      { title: "El hardware nunca es el del papel", body: "Dejá perillas para calibrar." },
      { title: "Un cerebro, muchos cuerpos", body: "Lo difícil se escribe una sola vez." },
      { title: "Diseñá para el wifi de la conferencia", body: "No para el de tu casa." },
    ],
    steps: 3,
    seconds: 30,
    owy: "Lo que aprendieron haciéndote: el hardware nunca es el del papel, un cerebro con muchos cuerpos, y diseñar para el wifi de la conferencia.",
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

  // --- Preguntas (15:30–37:30) ---
  {
    id: "qa",
    section: "preguntas",
    layout: "qa",
    title: "Preguntas y respuestas",
    seconds: 1320,
    owy: "Ronda de preguntas: el público pregunta desde el celular o con el micrófono de mano. Respondé corto, a la persona que preguntó, y devolvele la palabra a Agustín.",
    cues: [
      {
        label: "Owy pregunta al público",
        mode: "say",
        clip: "talk-qa-hands",
        text: "Ahora pregunto yo: ¿quién de ustedes ya le habló en voz alta a un bot y se sintió raro? Levanten la mano, que no los veo, pero me imagino.",
      },
      {
        label: "Leer la más votada",
        mode: "say",
        text: "La que sigue es: «{top}».",
      },
    ],
  },

  // --- Final (37:30–40:00) ---
  {
    id: "rating",
    section: "final",
    layout: "rating",
    title: "¿Qué te pareció?",
    input: { kind: "stars", prompt: "¿Qué te pareció la charla?" },
    seconds: 60,
    owy: "Cierre: el público puntúa la charla con estrellas desde el celular.",
    cues: [
      {
        label: "Despedida de Owy",
        mode: "say",
        clip: "talk-bye",
        text: "Gracias por bancarse una charla con un carpincho. Si me ven en el pasillo, tóquenme la perilla, que para eso estoy.",
      },
    ],
  },
  {
    id: "photo",
    section: "final",
    layout: "photo-op",
    title: "Foto con Owy",
    steps: 2,
    seconds: 45,
    pip: false,
    input: { kind: "reactions", prompt: "¡Mandá tu reacción para la foto!" },
    owy: "La foto de cierre: cuenta regresiva y todos con vos en pantalla.",
    cues: [{ label: "¡Digan mate!", mode: "say", clip: "talk-photo", text: "¡Foto! Todos digan «mate»." }],
  },
  {
    id: "end",
    section: "final",
    layout: "end",
    title: "Gracias",
    links: [
      { label: "Código", url: REPO },
      { label: "Slack de OWU", url: SLACK },
    ],
    seconds: 45,
    owy: "La placa final: gracias, OWU CONF 2026.",
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
