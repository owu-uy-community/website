import { z } from "zod";

/**
 * Owy Stage — the video-wall scene registry shared by the oRPC layer (what an
 * admin may set), the bridge (what it may push) and the stage pages (what they
 * render). No React here: this file is imported from server code.
 */

export const OWY_STAGE_CHANNEL = "owy-stage";

/** The 2026 rundown (staff spreadsheet); editable from the admin on the day. */
const DEFAULT_PROGRAM =
  "14:30 Recepción y acreditación | 15:00 Bienvenida | 15:15 Explicación open space + marketplace | 16:00 Open Space | 18:25 Coffee Break | 19:00 Charla 1 | 19:45 Charla 2 | 20:25 Despedida + foto";

export const SCENES = {
  "owy-face": {
    title: "Owy",
    description: "La cara de Owy reaccionando a las conversaciones (bridge del companion).",
    params: z.object({ captions: z.boolean().default(true) }),
  },
  logo: {
    title: "Logo OWU CONF",
    description: "Loop del logo con reveal, glitch y flotación.",
    params: z.object({}),
  },
  opening: {
    title: "Apertura",
    description: "Secuencia de apertura: formas, logo, fecha y lugar.",
    params: z.object({}),
  },
  message: {
    title: "Mensaje",
    description: "Texto grande para avisos y pausas.",
    params: z.object({
      title: z.string().trim().max(80).default("¡BIENVENIDOS!"),
      subtitle: z.string().trim().max(140).default(""),
    }),
  },
  "up-next": {
    title: "A continuación",
    description: "La charla casteada desde el open space (cast).",
    params: z.object({}),
  },
  sponsors: {
    title: "Sponsors",
    description: "Marquee de los sponsors 2026.",
    params: z.object({}),
  },
  countdown: {
    title: "Countdown",
    description: "El countdown del evento, en pantalla grande.",
    params: z.object({ label: z.string().trim().max(40).default("") }),
  },
  agenda: {
    title: "Agenda",
    description: "La grilla del open space: bloque actual y los que siguen, en vivo.",
    params: z.object({ title: z.string().trim().max(40).default("Open Space") }),
  },
  moments: {
    title: "Momentos",
    description: "Fotos de La Meetup III con movimiento lento (Ken Burns).",
    params: z.object({ secondsPerPhoto: z.coerce.number().int().min(3).max(60).default(6) }),
  },
  "lower-third": {
    title: "Lower third",
    description: "Nombre y charla del speaker; pensado para ?bg=transparent sobre la cámara.",
    params: z.object({
      title: z.string().trim().max(60).default("Nombre Apellido"),
      subtitle: z.string().trim().max(100).default("Título de la charla"),
    }),
  },
  clock: {
    title: "Reloj",
    description: "Hora y fecha en grande, con un aviso opcional.",
    params: z.object({ label: z.string().trim().max(60).default("") }),
  },
  closing: {
    title: "Cierre",
    description: "Gracias, confetti y los sponsors para despedir el evento.",
    params: z.object({
      title: z.string().trim().max(40).default("¡GRACIAS!"),
      subtitle: z.string().trim().max(100).default("Nos vemos en la próxima"),
    }),
  },
  shapes: {
    title: "Formas",
    description: "Salvapantallas generativo con la geometría de la marca.",
    params: z.object({}),
  },
  team: {
    title: "Equipo",
    description: "Créditos: el equipo de OWU CONF 2026.",
    params: z.object({}),
  },
  launch: {
    title: "Lanzamiento",
    description: "Cuenta regresiva 10…1 y el logo explota en pantalla. Arranca al ponerla en pantalla.",
    params: z.object({ seconds: z.coerce.number().int().min(3).max(60).default(10) }),
  },
  terminal: {
    title: "Terminal",
    description: "La secuencia de arranque, tipeada en una terminal.",
    params: z.object({}),
  },
  ideas: {
    title: "Ideas",
    description: "Los títulos del open space flotando como una galaxia, en vivo.",
    params: z.object({}),
  },
  tangram: {
    title: "Tangram",
    description: "El collage de fotos de /conf armándose en la pared y mezclándose.",
    params: z.object({}),
  },
  kaleidoscope: {
    title: "Caleidoscopio",
    description: "Formas de la marca reflejadas ocho veces. Hipnótico para las pausas.",
    params: z.object({}),
  },
  "owy-talks": {
    title: "Owy charlatán",
    description: "Owy suelta frases rioplatenses cada tanto, sin bridge.",
    params: z.object({}),
  },
  ticker: {
    title: "Ticker",
    description: "Barra de noticias abajo (separá los ítems con ·); ideal con ?bg=transparent.",
    params: z.object({
      label: z.string().trim().max(24).default("OWU CONF"),
      text: z
        .string()
        .trim()
        .max(600)
        .default("WiFi: OWU-CONF · Próxima charla 16:00 · Proponé tu charla en el open space · #OWUCONF"),
    }),
  },
  talk: {
    title: "Charla en curso",
    description: "Título, speaker y un reloj de charla que arranca al ponerla en pantalla.",
    params: z.object({
      title: z.string().trim().max(90).default("Título de la charla"),
      speaker: z.string().trim().max(60).default("Speaker"),
      minutes: z.coerce.number().int().min(1).max(180).default(20),
    }),
  },
  sponsor: {
    title: "Sponsor destacado",
    description: "Un sponsor por vez, en grande.",
    params: z.object({ secondsPerSponsor: z.coerce.number().int().min(2).max(60).default(5) }),
  },
  days: {
    title: "Faltan X días",
    description: "Cuenta regresiva en días al 07 de noviembre.",
    params: z.object({}),
  },
  program: {
    title: "Programa del día",
    description: "Los bloques de la jornada con el actual marcado. Ítems: “HH:MM Título | HH:MM Título”.",
    params: z.object({
      title: z.string().trim().max(40).default("OWU CONF 2026"),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
    }),
  },
  next: {
    title: "Próximo bloque",
    description: "Cuenta regresiva automática al siguiente ítem del programa (mismo formato que Programa).",
    params: z.object({
      label: z.string().trim().max(40).default("Volvemos en"),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
    }),
  },
  room: {
    title: "Sala",
    description: "El día completo de una sala del open space; para la pantalla de la puerta.",
    params: z.object({ room: z.string().trim().max(40).default("Lobby") }),
  },
  "cast-bar": {
    title: "Barra de cast",
    description: "Lower third automático con la charla casteada desde el open space; para ?bg=transparent.",
    params: z.object({}),
  },
  wifi: {
    title: "WiFi",
    description: "Red y contraseña en grande.",
    params: z.object({
      network: z.string().trim().max(40).default("OWU-CONF"),
      password: z.string().trim().max(40).default("comunidad2026"),
    }),
  },
  alert: {
    title: "Aviso",
    description: "Un anuncio imposible de ignorar (franjas amarillas, pulso).",
    params: z.object({
      title: z.string().trim().max(60).default("Foto grupal en 5 minutos"),
      body: z.string().trim().max(160).default("Nos juntamos en el escenario principal"),
    }),
  },
  steps: {
    title: "Pasos",
    description: "Instructivo numerado, hasta cuatro pasos.",
    params: z.object({
      title: z.string().trim().max(50).default("Proponé tu charla"),
      step1: z.string().trim().max(90).default("Escribí tu idea en un sticky del mercado de ideas"),
      step2: z.string().trim().max(90).default("Contala en un minuto frente a todos"),
      step3: z.string().trim().max(90).default("Pegala en la grilla: sala y horario"),
      step4: z.string().trim().max(90).default("Quien quiera, va. Ley de los dos pies."),
    }),
  },
  "owy-howto": {
    title: "Hablá con Owy",
    description: "Owy explica cómo proponer una charla hablándole en la mesa del mercado.",
    params: z.object({}),
  },
  social: {
    title: "Sumate",
    description: "Hashtag, sitio y comunidad, bien grande.",
    params: z.object({
      hashtag: z.string().trim().max(30).default("#OWUCONF"),
      url: z.string().trim().max(60).default("conf.owu.uy"),
      line: z.string().trim().max(90).default("Slack de OWU: owu.uy/slack"),
    }),
  },
  photo: {
    title: "Foto grupal",
    description: "3, 2, 1 y flash. Arranca al ponerla en pantalla.",
    params: z.object({ seconds: z.coerce.number().int().min(3).max(15).default(5) }),
  },
  block: {
    title: "Bloque",
    description: "La tarjeta del bloque en curso (automática desde el programa) o una manual: título + horario.",
    params: z.object({
      title: z.string().trim().max(50).default(""),
      time: z.string().trim().max(30).default(""),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
    }),
  },
  cams: {
    title: "Cámaras",
    description:
      "Marcos para 1, 2 o 3 cámaras con el nombre de la sala. Verde croma en negro; huecos reales con ?bg=transparent.",
    params: z.object({
      layout: z.coerce.number().int().min(1).max(3).default(2),
      label1: z.string().trim().max(24).default("Centro"),
      label2: z.string().trim().max(24).default("Lobby"),
      label3: z.string().trim().max(24).default(""),
    }),
  },
  community: {
    title: "OWU",
    description: "La tarjeta de la comunidad: logo y tagline.",
    params: z.object({
      tagline: z
        .string()
        .trim()
        .max(200)
        .default(
          "Un espacio donde personas apasionadas por la tecnología se reúnen, comparten y convierten sus ideas en realidad"
        ),
    }),
  },
  silence: {
    title: "Silencio",
    description: "Para cuando la sala no se calla.",
    params: z.object({ text: z.string().trim().max(20).default("SILENCIO") }),
  },
  promo: {
    title: "Promo",
    description: "Cupón de un sponsor: oferta, código y letra chica.",
    params: z.object({
      sponsor: z.string().trim().max(30).default("Sponsor"),
      offer: z.string().trim().max(40).default("20% OFF"),
      code: z.string().trim().max(30).default("OWUCONF"),
      detail: z.string().trim().max(120).default("Mostrando este código en el local durante el evento"),
    }),
  },
  qr: {
    title: "QR",
    description: "Un link como QR gigante: compartí tus fotos, inscripción, lo que sea.",
    params: z.object({
      title: z.string().trim().max(50).default("Compartí tus fotos"),
      url: z.string().trim().max(300).default("conf.owu.uy"),
      caption: z.string().trim().max(120).default("Subí las fotos que sacaste hoy"),
    }),
  },
  after: {
    title: "After",
    description: "Dónde sigue la noche.",
    params: z.object({
      venue: z.string().trim().max(40).default("MBC"),
      detail: z.string().trim().max(80).default("Montevideo Beer Company · a dos cuadras"),
      offer: z.string().trim().max(12).default("2x1"),
    }),
  },
  board: {
    title: "Muro de ideas",
    description: "Las propuestas del open space como stickies en la pared, en vivo.",
    params: z.object({}),
  },
  "rooms-now": {
    title: "Ahora en cada sala",
    description: "Una tarjeta por sala: lo que pasa ahora y lo que sigue.",
    params: z.object({}),
  },
  marquee: {
    title: "Marquesina",
    description: "Texto gigante desfilando en dos filas.",
    params: z.object({ text: z.string().trim().max(120).default("OWU CONF 2026 · Hecha por la comunidad") }),
  },
  until: {
    title: "Hasta las…",
    description: "Cuenta regresiva hasta una hora del reloj.",
    params: z.object({
      label: z.string().trim().max(40).default("Volvemos a las"),
      time: z
        .string()
        .trim()
        .regex(/^\d{1,2}:\d{2}$/, "HH:MM")
        .default("17:30"),
    }),
  },
  quote: {
    title: "Frase",
    description: "Una cita grande con su autor.",
    params: z.object({
      text: z.string().trim().max(200).default("Las mejores ideas aparecen cuando la comunidad se junta."),
      author: z.string().trim().max(60).default("OWU"),
    }),
  },
  "sponsor-wall": {
    title: "Pared de sponsors",
    description: "Todos los logos a la vez, con entrada escalonada.",
    params: z.object({}),
  },
  applause: {
    title: "Aplauso",
    description: "“Un aplauso para…” con lluvia de 👏 y confetti.",
    params: z.object({ name: z.string().trim().max(60).default("nuestros speakers") }),
  },
  speaker: {
    title: "Speaker",
    description: "La tarjeta de presentación antes de una charla: nombre, empresa y título.",
    params: z.object({
      name: z.string().trim().max(60).default("Nombre Apellido"),
      company: z.string().trim().max(60).default(""),
      talk: z.string().trim().max(120).default("Título de la charla"),
    }),
  },
  numbers: {
    title: "En números",
    description: "Hasta tres cifras con animación de conteo.",
    params: z.object({
      title: z.string().trim().max(50).default("OWU CONF en números"),
      n1: z.coerce.number().int().min(0).max(999999).default(300),
      l1: z.string().trim().max(30).default("asistentes"),
      n2: z.coerce.number().int().min(0).max(999999).default(20),
      l2: z.string().trim().max(30).default("ideas"),
      n3: z.coerce.number().int().min(0).max(999999).default(14),
      l3: z.string().trim().max(30).default("sponsors"),
    }),
  },
  rain: {
    title: "Lluvia de código",
    description: "Caracteres cayendo en amarillo y azul con el logo en el medio.",
    params: z.object({}),
  },
  warp: {
    title: "Hiperespacio",
    description: "Estrellas hacia el logo. Para entrar al bloque de charlas.",
    params: z.object({}),
  },
  qa: {
    title: "Preguntas",
    description: "“¿Preguntas?” para la ronda de Q&A.",
    params: z.object({
      subtitle: z.string().trim().max(120).default("Levantá la mano o escribí en #owuconf del Slack"),
    }),
  },
  meetups: {
    title: "Próximos meetups",
    description: "La agenda real de la comunidad (meetup-bot) para el cierre: la comunidad sigue.",
    params: z.object({}),
  },
  pulse: {
    title: "Somos",
    description: "Cuántos ya llegaron (Eventbrite, solo totales) más ideas y salas de la grilla. Se actualiza solo.",
    params: z.object({ title: z.string().trim().max(40).default("Ya somos") }),
  },
  principles: {
    title: "Principios del open space",
    description: "Los cuatro principios y la ley de los dos pies.",
    params: z.object({}),
  },
  "owy-card": {
    title: "Conocé a Owy",
    description: "El carpincho ilustrado con su bio.",
    params: z.object({
      bio: z
        .string()
        .trim()
        .max(220)
        .default(
          "El carpincho de OWU. Toma mate, escucha ideas y las anota en la grilla. Hoy está en la mesa del mercado de ideas y en esta pantalla."
        ),
    }),
  },
  history: {
    title: "Historia",
    description: "De La Meetup I (2023) a OWU CONF (2026), en una línea de tiempo animada.",
    params: z.object({}),
  },
  venue: {
    title: "Estamos en",
    description: "Lugar, dirección y QR con cómo llegar.",
    params: z.object({
      name: z.string().trim().max(40).default("Sinergia Faro"),
      address: z.string().trim().max(80).default("Víctor Soliño 349 · Montevideo"),
      mapUrl: z.string().trim().max(300).default(""),
    }),
  },
  selfie: {
    title: "Selfie",
    description: "Marco para sacarse fotos frente a la pantalla, con el hashtag.",
    params: z.object({
      hashtag: z.string().trim().max(30).default("#OWUCONF"),
      line: z.string().trim().max(60).default("Etiquetá a @owu_uy"),
    }),
  },
  raffle: {
    title: "Sorteo",
    description: "Gira por los nombres y cae en uno al azar, con confetti. Nombres separados por coma.",
    params: z.object({
      title: z.string().trim().max(40).default("Sorteo"),
      names: z.string().trim().max(3000).default("Ana, Bruno, Camila, Diego, Elena, Fede, Gabi, Hernán"),
    }),
  },
  welcome: {
    title: "Bienvenida",
    description: "La foto de la comunidad con el saludo en grande.",
    params: z.object({
      eyebrow: z.string().trim().max(60).default("Sábado 07 de noviembre · Sinergia Faro"),
      title: z.string().trim().max(60).default("Bienvenidos a OWU CONF"),
    }),
  },
  trivia: {
    title: "Trivia",
    description: "Pregunta con cuatro opciones; cuenta regresiva y revela la correcta con confetti.",
    params: z.object({
      question: z.string().trim().max(140).default("¿En qué año fue la primera OWU CONF?"),
      a: z.string().trim().max(60).default("2019"),
      b: z.string().trim().max(60).default("2022"),
      c: z.string().trim().max(60).default("2024"),
      d: z.string().trim().max(60).default("2025"),
      answer: z.string().trim().max(1).default("C"),
      seconds: z.number().int().min(0).max(120).default(20),
    }),
  },
  versus: {
    title: "Versus",
    description: "Dos mitades, la sala elige un lado a los gritos.",
    params: z.object({
      question: z.string().trim().max(60).default("¿Qué preferís?"),
      left: z.string().trim().max(24).default("Tabs"),
      right: z.string().trim().max(24).default("Spaces"),
    }),
  },
  lineup: {
    title: "Charlas",
    description: "El bloque de charlas: hora, título y quién la da (hasta tres).",
    params: z.object({
      eyebrow: z.string().trim().max(60).default("Después del coffee"),
      title: z.string().trim().max(40).default("Charlas"),
      h1: z.string().trim().max(5).default("19:00"),
      t1: z.string().trim().max(90).default("Charla 1"),
      s1: z.string().trim().max(60).default(""),
      h2: z.string().trim().max(5).default("19:45"),
      t2: z.string().trim().max(90).default("Charla 2"),
      s2: z.string().trim().max(60).default(""),
      h3: z.string().trim().max(5).default(""),
      t3: z.string().trim().max(90).default(""),
      s3: z.string().trim().max(60).default(""),
    }),
  },
  "owy-says": {
    title: "Owy dice",
    description: "Owy piensa, dice el mensaje que escribas y sonríe.",
    params: z.object({
      text: z
        .string()
        .trim()
        .max(200)
        .default("¡Hola! Vengan a hablar conmigo en el stand, tengo cosas que contarles."),
    }),
  },
  aurora: {
    title: "Aurora",
    description: "Manchas de color de la marca flotando; fondo para el break.",
    params: z.object({}),
  },
  dvd: {
    title: "DVD",
    description: "El logo rebota por la pantalla. Si toca una esquina, hay confetti.",
    params: z.object({}),
  },
  life: {
    title: "Game of Life",
    description: "El autómata de Conway en colores OWU; se resiembra solo.",
    params: z.object({}),
  },
  "test-card": {
    title: "Carta de ajuste",
    description: "Barras de color y hora para probar la señal antes de abrir puertas.",
    params: z.object({}),
  },
  conduct: {
    title: "Código de conducta",
    description: "Tres reglas y a quién acudir.",
    params: z.object({
      l1: z.string().trim().max(120).default("Un entorno amigable, respetuoso e inclusivo para todas las personas."),
      l2: z.string().trim().max(120).default("Sin comentarios ofensivos, acoso, intimidación ni discriminación."),
      l3: z.string().trim().max(120).default("Los organizadores pueden pedirte que te retires si no lo respetás."),
      contact: z.string().trim().max(120).default("Si algo te incomoda, buscá a cualquiera del staff con remera OWU."),
    }),
  },
  mosaic: {
    title: "Mosaico",
    description: "Seis fotos de ediciones anteriores; van cambiando de a una.",
    params: z.object({}),
  },
  frame: {
    title: "Marco",
    description:
      "Overlay permanente: marco amarillo, logo y tira de sponsors. Capa superior en OBS con ?bg=transparent.",
    params: z.object({ label: z.string().trim().max(30).default("En vivo") }),
  },
  black: {
    title: "Negro",
    description: "Pantalla vacía.",
    params: z.object({}),
  },
} as const;

export type SceneId = keyof typeof SCENES;
export const SCENE_IDS = Object.keys(SCENES) as SceneId[];
export type SceneParams<K extends SceneId> = z.infer<(typeof SCENES)[K]["params"]>;
/** What a scene component receives: its validated params plus the wall's working event. */
export type SceneProps<K extends SceneId> = { params: SceneParams<K>; eventId: string | null };

export function isSceneId(value: string): value is SceneId {
  return value in SCENES;
}

export const EFFECTS = ["confetti", "flash", "owy-happy", "caption", "emoji"] as const;
export type EffectId = (typeof EFFECTS)[number];

export const FACE_STATES = ["idle", "listening", "thinking", "speaking", "happy", "error", "offline"] as const;
export type FaceState = (typeof FACE_STATES)[number];

export const StageStateSchema = z.object({
  scene: z.enum(SCENE_IDS as [SceneId, ...SceneId[]]),
  params: z.record(z.string(), z.unknown()).default({}),
  eventId: z.string().nullable().default(null),
});
export type StageState = z.infer<typeof StageStateSchema>;

export const DEFAULT_STAGE_STATE: StageState = { scene: "black", params: {}, eventId: null };

export const EffectEventSchema = z.object({
  effect: z.enum(EFFECTS),
  payload: z
    .object({ text: z.string().trim().max(200) })
    .partial()
    .optional(),
});
export type EffectEvent = z.infer<typeof EffectEventSchema>;

export const FaceEventSchema = z.object({
  state: z.enum(FACE_STATES),
  transcript: z
    .object({
      who: z.enum(["input", "output"]),
      text: z.string().trim().max(400),
    })
    .optional(),
  /** Which Owy produced it (device id / web session); informational. */
  source: z.string().max(80).optional(),
});
export type FaceEvent = z.infer<typeof FaceEventSchema>;

/** Parse scene params against the scene's schema, applying defaults. */
export function parseSceneParams<K extends SceneId>(scene: K, params: unknown): SceneParams<K> {
  return SCENES[scene].params.parse(params ?? {}) as SceneParams<K>;
}
