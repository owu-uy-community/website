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

const DEPARTMENTS =
  "Montevideo | Canelones | Maldonado | Colonia | San José | Salto | Paysandú | Rivera | Tacuarembó | Cerro Largo | Rocha | Florida | Lavalleja | Durazno | Soriano | Río Negro | Artigas | Treinta y Tres | Flores | Otro país";

/**
 * Ágiles Uruguay 2026 (01 OCT 2026) — the scenes below run on the host's own
 * brand (lineamientos de diseño: #0B192C, Poppins + Open Sans, #EVOLUCIONANDO),
 * so they never borrow OWU's geometry. Everything here is a default an operator
 * can edit from the admin on the day.
 */
const AGILES_DATE = "01 de octubre · 17:00 h";
const AGILES_HASHTAG = "#EVOLUCIONANDO";
/** The real agenda: `HH:MM[-HH:MM] Título :: Descripción`, separated by `|`. */
const AGILES_PROGRAM = [
  "17:00-17:30 Bienvenida y apertura :: ¡Comenzamos el evento conectando como Comunidad!",
  "17:45-20:00 Open Space :: Espacio colaborativo cocreado por todas las personas asistentes.",
  "20:00-20:15 Break :: ¡Recarguemos energías!",
  "20:15-20:45 Charla · Federico Toledo :: ¿Cómo evoluciona la Agilidad en la era de la IA?",
  "20:45-21:15 Charla · Dioselinda Roa :: Error como motor: entre lo que controlas, lo que sueltas y lo que evolucionas.",
  "21:15-22:00 Sorteo, cosecha y cierre :: Sorteo entre asistentes, reflexiones y agradecimientos.",
  "22:00 ¡After! :: La seguimos en Cantina Bombín, a 4 cuadras, ¡para seguir conectando y conversando!",
].join(" | ");
const AGILES_SPONSORS =
  "UCU | Uruguay Technology | OWU | Búsquedas IT | Roderichs | Reimpulso | Mimiquate | Kleer | Life Cinemas | Henka | Pia | Manzanares";
const AGILES_OS_PRINCIPLES =
  "Quienes vienen son las personas indicadas | Lo que pase es lo único que podía pasar | Empieza cuando empieza | Cuando se termina, se terminó";
const AGILES_OS_STEPS =
  "Escribí tu tema en una hoja: título y tu nombre | Presentalo en voz alta al grupo, en 30 segundos | Pegalo en la grilla: elegí sala y horario";
/** Open space 17:45–20:00: marketplace primero, después tres rondas. */
const AGILES_OS_ROUNDS = "18:15-18:45 | 18:50-19:20 | 19:25-19:55";
const AGILES_OS_CLOSING =
  "¿Qué te llevás de hoy? | ¿Qué conversación querés continuar? | ¿Con quién querés seguir en contacto? | ¿Qué vas a probar el lunes?";

export const SCENE_CATEGORIES = {
  agiles: { title: "Ágiles Uruguay 2026" },
  agilesOpenSpace: { title: "Ágiles · Open space" },
  opening: { title: "Apertura y cierre" },
  programme: { title: "Programa y horarios" },
  talks: { title: "Charlas y escenario" },
  openspace: { title: "Open space" },
  owy: { title: "Owy" },
  info: { title: "Info y avisos" },
  sponsors: { title: "Sponsors" },
  community: { title: "Comunidad y recuerdos" },
  interactive: { title: "Interactivo · celular" },
  inperson: { title: "Interactivo · en persona" },
  games: { title: "Juegos y humor" },
  visuals: { title: "Visuales y música" },
  utility: { title: "Utilidades" },
} as const;
export type SceneCategory = keyof typeof SCENE_CATEGORIES;
export const SCENE_CATEGORY_IDS = Object.keys(SCENE_CATEGORIES) as SceneCategory[];

export const SCENES = {
  // --- Apertura y cierre ---
  logo: {
    category: "opening",
    title: "Logo OWU CONF",
    description: "Loop del logo con reveal, glitch y flotación.",
    params: z.object({}),
  },
  opening: {
    category: "opening",
    title: "Apertura",
    description: "Secuencia de apertura: formas, logo, fecha y lugar.",
    params: z.object({}),
  },
  welcome: {
    category: "opening",
    title: "Bienvenida",
    description: "La foto de la comunidad con el saludo en grande.",
    params: z.object({
      eyebrow: z.string().trim().max(60).default("Sábado 07 de noviembre · Sinergia Faro"),
      title: z.string().trim().max(60).default("Bienvenidos a OWU CONF"),
    }),
  },
  message: {
    category: "opening",
    title: "Mensaje",
    description: "Texto grande para avisos y pausas.",
    params: z.object({
      title: z.string().trim().max(80).default("¡BIENVENIDOS!"),
      subtitle: z.string().trim().max(140).default(""),
    }),
  },
  countdown: {
    category: "opening",
    title: "Countdown",
    description: "El countdown del evento, en pantalla grande.",
    params: z.object({ label: z.string().trim().max(40).default("") }),
  },
  days: {
    category: "opening",
    title: "Faltan X días",
    description: "Cuenta regresiva en días al 07 de noviembre.",
    params: z.object({}),
  },
  launch: {
    category: "opening",
    title: "Lanzamiento",
    description: "Cuenta regresiva 10…1 y el logo explota en pantalla. Arranca al ponerla en pantalla.",
    params: z.object({ seconds: z.coerce.number().int().min(3).max(60).default(10) }),
  },
  photo: {
    category: "opening",
    title: "Foto grupal",
    description: "3, 2, 1 y flash. Arranca al ponerla en pantalla.",
    params: z.object({ seconds: z.coerce.number().int().min(3).max(15).default(5) }),
  },
  closing: {
    category: "opening",
    title: "Cierre",
    description: "Gracias, confetti y los sponsors para despedir el evento.",
    params: z.object({
      title: z.string().trim().max(40).default("¡GRACIAS!"),
      subtitle: z.string().trim().max(100).default("Nos vemos en la próxima"),
    }),
  },
  credits: {
    category: "opening",
    title: "Créditos",
    description: "Créditos finales que suben. Formato: Rol: nombres | Rol: nombres.",
    params: z.object({
      lines: z
        .string()
        .trim()
        .max(2000)
        .default(
          "Organización: OWU Uruguay | Sede: Sinergia Faro | Facilitación open space: el equipo OWU | Sponsors: gracias a todos los que hicieron esto posible | Fotos: la comunidad | Owy: hecho con cariño y mucho café | Vos: por venir"
        ),
    }),
  },
  after: {
    category: "opening",
    title: "After",
    description: "Dónde sigue la noche.",
    params: z.object({
      venue: z.string().trim().max(40).default("MBC"),
      detail: z.string().trim().max(80).default("Montevideo Beer Company · a dos cuadras"),
      offer: z.string().trim().max(12).default("2x1"),
    }),
  },
  // --- Programa y horarios ---
  program: {
    category: "programme",
    title: "Programa del día",
    description: "Los bloques de la jornada con el actual marcado. Ítems: “HH:MM Título | HH:MM Título”.",
    params: z.object({
      title: z.string().trim().max(40).default("OWU CONF 2026"),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
    }),
  },
  agenda: {
    category: "programme",
    title: "Agenda",
    description: "La grilla del open space: bloque actual y los que siguen, en vivo.",
    params: z.object({ title: z.string().trim().max(40).default("Open Space") }),
  },
  next: {
    category: "programme",
    title: "Próximo bloque",
    description: "Cuenta regresiva automática al siguiente ítem del programa (mismo formato que Programa).",
    params: z.object({
      label: z.string().trim().max(40).default("Volvemos en"),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
    }),
  },
  block: {
    category: "programme",
    title: "Bloque",
    description: "La tarjeta del bloque en curso (automática desde el programa) o una manual: título + horario.",
    params: z.object({
      title: z.string().trim().max(50).default(""),
      time: z.string().trim().max(30).default(""),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
    }),
  },
  "now-bar": {
    category: "programme",
    title: "Barra ahora / sigue",
    description:
      "Lower third con el bloque actual, el siguiente y la hora, según el programa. Para cámaras con ?bg=transparent.",
    params: z.object({ items: z.string().trim().max(1200).default(DEFAULT_PROGRAM) }),
  },
  timeline: {
    category: "programme",
    title: "Línea del día",
    description: "Barra del día completo con la aguja de la hora: cuánto va y cuánto falta.",
    params: z.object({
      title: z.string().trim().max(40).default("Así va el día"),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
      end: z.string().trim().max(5).default("20:40"),
    }),
  },
  pipeline: {
    category: "programme",
    title: "Pipeline",
    description: "El programa del día como un pipeline de CI: qué pasó, qué corre, qué falta.",
    params: z.object({ items: z.string().trim().max(1200).default(DEFAULT_PROGRAM) }),
  },
  departures: {
    category: "programme",
    title: "Panel de salidas",
    description: "El programa como el panel de un aeropuerto: letras que giran y estado de cada bloque.",
    params: z.object({
      title: z.string().trim().max(30).default("OWU CONF · Salidas"),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
    }),
  },
  clock: {
    category: "programme",
    title: "Reloj",
    description: "Hora y fecha en grande, con un aviso opcional.",
    params: z.object({ label: z.string().trim().max(60).default("") }),
  },
  until: {
    category: "programme",
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
  reminders: {
    category: "programme",
    title: "Avisos programados",
    description: "Mensajes que aparecen solos a su hora y se quedan unos minutos. Formato: HH:MM texto | …",
    params: z.object({
      lines: z
        .string()
        .trim()
        .max(1200)
        .default(
          "15:55 El open space arranca en 5 minutos: buscá tu sala | 18:20 Coffee break en 5 minutos en el hall | 18:55 Las charlas empiezan a las 19:00 en el escenario | 20:20 Foto grupal en 5 minutos en el escenario"
        ),
      hold: z.number().int().min(1).max(60).default(8),
    }),
  },
  changes: {
    category: "programme",
    title: "Cambios en el programa",
    description: "Qué se movió y qué se canceló. Formato: antes → después | …",
    params: z.object({
      lines: z
        .string()
        .trim()
        .max(1200)
        .default(
          "16:45 Sesión de IA · Sala Lobby → Sala Faro | 17:30 Taller de Rust → cancelada | 18:25 Coffee break → 18:40"
        ),
    }),
  },
  // --- Charlas y escenario ---
  "up-next": {
    category: "talks",
    title: "A continuación",
    description: "La charla casteada desde el open space (cast).",
    params: z.object({}),
  },
  "cast-bar": {
    category: "talks",
    title: "Barra de cast",
    description: "Lower third automático con la charla casteada desde el open space; para ?bg=transparent.",
    params: z.object({}),
  },
  "lower-third": {
    category: "talks",
    title: "Lower third",
    description: "Nombre y charla del speaker; pensado para ?bg=transparent sobre la cámara.",
    params: z.object({
      title: z.string().trim().max(60).default("Nombre Apellido"),
      subtitle: z.string().trim().max(100).default("Título de la charla"),
    }),
  },
  speaker: {
    category: "talks",
    title: "Speaker",
    description: "La tarjeta de presentación antes de una charla: nombre, empresa y título.",
    params: z.object({
      name: z.string().trim().max(60).default("Nombre Apellido"),
      company: z.string().trim().max(60).default(""),
      talk: z.string().trim().max(120).default("Título de la charla"),
    }),
  },
  talk: {
    category: "talks",
    title: "Charla en curso",
    description: "Título, speaker y un reloj de charla que arranca al ponerla en pantalla.",
    params: z.object({
      title: z.string().trim().max(90).default("Título de la charla"),
      speaker: z.string().trim().max(60).default("Speaker"),
      minutes: z.coerce.number().int().min(1).max(180).default(20),
    }),
  },
  lineup: {
    category: "talks",
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
  lightning: {
    category: "talks",
    title: "Lightning talks",
    description: "Cola de charlas relámpago con timer por charla; avanza sola desde que se pone en pantalla.",
    params: z.object({
      title: z.string().trim().max(40).default("Lightning talks"),
      talks: z
        .string()
        .trim()
        .max(1500)
        .default(
          "Ana · Cómo dejé de temerle a los regex | Bruno · Mi setup de terminal | Camila · Lo que aprendí organizando meetups | Diego · Rust en 5 minutos"
        ),
      minutes: z.number().int().min(1).max(30).default(5),
    }),
  },
  qa: {
    category: "talks",
    title: "Preguntas",
    description: "“¿Preguntas?” para la ronda de Q&A.",
    params: z.object({
      subtitle: z.string().trim().max(120).default("Levantá la mano o escribí en #owuconf del Slack"),
    }),
  },
  "talk-timer": {
    category: "talks",
    title: "Timer de charla",
    description: "Cuenta regresiva para quien habla: arranca al ponerla en pantalla, avisa al final.",
    params: z.object({
      title: z.string().trim().max(40).default("Tiempo de charla"),
      minutes: z.number().int().min(1).max(180).default(20),
      warn: z.number().int().min(0).max(60).default(5),
    }),
  },
  "traffic-light": {
    category: "talks",
    title: "Semáforo",
    description: "Señal para quien habla: verde, amarillo o rojo, con su mensaje.",
    params: z.object({
      state: z.enum(["verde", "amarillo", "rojo"]).default("verde"),
      green: z.string().trim().max(40).default("Adelante"),
      yellow: z.string().trim().max(40).default("Últimos 5 minutos"),
      red: z.string().trim().max(40).default("Tiempo"),
    }),
  },
  silence: {
    category: "talks",
    title: "Silencio",
    description: "Para cuando la sala no se calla.",
    params: z.object({ text: z.string().trim().max(20).default("SILENCIO") }),
  },
  applause: {
    category: "talks",
    title: "Aplauso",
    description: "“Un aplauso para…” con lluvia de 👏 y confetti.",
    params: z.object({ name: z.string().trim().max(60).default("nuestros speakers") }),
  },
  live: {
    category: "talks",
    title: "En vivo",
    description: "Aviso de transmisión con QR: para quien no pudo venir.",
    params: z.object({
      title: z.string().trim().max(60).default("Estamos transmitiendo"),
      subtitle: z.string().trim().max(140).default("Compartilo con quien no pudo venir: las charlas se ven en vivo."),
      url: z.string().trim().max(200).default("https://www.youtube.com/@owuuy"),
    }),
  },
  cams: {
    category: "talks",
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
  // --- Open space ---
  principles: {
    category: "openspace",
    title: "Principios del open space",
    description: "Los cuatro principios y la ley de los dos pies.",
    params: z.object({}),
  },
  board: {
    category: "openspace",
    title: "Muro de ideas",
    description: "Las propuestas del open space como stickies en la pared, en vivo.",
    params: z.object({}),
  },
  grid: {
    category: "openspace",
    title: "Grilla del open space",
    description: "La grilla salas × horarios con las sesiones del muro, en vivo; resalta el bloque en curso.",
    params: z.object({}),
  },
  "rooms-now": {
    category: "openspace",
    title: "Ahora en cada sala",
    description: "Una tarjeta por sala: lo que pasa ahora y lo que sigue.",
    params: z.object({}),
  },
  room: {
    category: "openspace",
    title: "Sala",
    description: "El día completo de una sala del open space; para la pantalla de la puerta.",
    params: z.object({ room: z.string().trim().max(40).default("Lobby") }),
  },
  "room-cards": {
    category: "openspace",
    title: "Las salas",
    description: "Cada sala como cartel: color, ícono, capacidad, pantalla y pizarra; desde la base.",
    params: z.object({}),
  },
  rounds: {
    category: "openspace",
    title: "Rondas del open space",
    description: "Ronda actual, tiempo restante y las que faltan; el reloj facilita solo. Formato HH:MM-HH:MM | …",
    params: z.object({
      title: z.string().trim().max(40).default("Open space"),
      rounds: z.string().trim().max(300).default("16:00-16:40 | 16:45-17:25 | 17:30-18:10"),
    }),
  },
  hosts: {
    category: "openspace",
    title: "Quiénes facilitan",
    description: "Los nombres de quienes proponen sesiones, en vivo desde el muro.",
    params: z.object({}),
  },
  topics: {
    category: "openspace",
    title: "De qué se habla",
    description: "Nube de palabras armada con los títulos de las sesiones del muro.",
    params: z.object({}),
  },
  ideas: {
    category: "openspace",
    title: "Ideas",
    description: "Los títulos del open space flotando como una galaxia, en vivo.",
    params: z.object({}),
  },
  // --- Owy ---
  "owy-face": {
    category: "owy",
    title: "Owy",
    description:
      "La cara de Owy reaccionando a las conversaciones (bridge del companion); en el mercado de ideas, el pitch que escucha y la charla que acaba de ubicar.",
    params: z.object({ captions: z.boolean().default(true) }),
  },
  "owy-says": {
    category: "owy",
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
  "owy-card": {
    category: "owy",
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
  "owy-howto": {
    category: "owy",
    title: "Hablá con Owy",
    description: "Owy explica cómo proponer una charla hablándole en la mesa del mercado.",
    params: z.object({}),
  },
  "owy-talks": {
    category: "owy",
    title: "Owy charlatán",
    description: "Owy suelta frases rioplatenses cada tanto, sin bridge.",
    params: z.object({}),
  },
  // --- Info y avisos ---
  wifi: {
    category: "info",
    title: "WiFi",
    description: "Red y contraseña en grande.",
    params: z.object({
      network: z.string().trim().max(40).default("OWU-CONF"),
      password: z.string().trim().max(40).default("comunidad2026"),
    }),
  },
  "wifi-qr": {
    category: "info",
    title: "Wi-Fi con QR",
    description: "Red y contraseña, más el QR que conecta el celular solo.",
    params: z.object({
      network: z.string().trim().max(40).default("OWU-CONF"),
      password: z.string().trim().max(60).default("comunidad2026"),
    }),
  },
  links: {
    category: "info",
    title: "Links",
    description: "Hasta cuatro QR a la vez. Formato: Etiqueta: https://… | …",
    params: z.object({
      title: z.string().trim().max(40).default("Todo en tu celular"),
      lines: z
        .string()
        .trim()
        .max(600)
        .default(
          "Programa: https://owu.uy/conf | Instagram: https://www.instagram.com/owu__uy/ | Slack: https://slack.owu.uy/ | LinkedIn: https://www.linkedin.com/company/owu-uruguay/"
        ),
    }),
  },
  qr: {
    category: "info",
    title: "QR",
    description: "Un link como QR gigante: compartí tus fotos, inscripción, lo que sea.",
    params: z.object({
      title: z.string().trim().max(50).default("Compartí tus fotos"),
      url: z.string().trim().max(300).default("conf.owu.uy"),
      caption: z.string().trim().max(120).default("Subí las fotos que sacaste hoy"),
    }),
  },
  social: {
    category: "info",
    title: "Sumate",
    description: "Hashtag, sitio y comunidad, bien grande.",
    params: z.object({
      hashtag: z.string().trim().max(30).default("#OWUCONF"),
      url: z.string().trim().max(60).default("conf.owu.uy"),
      line: z.string().trim().max(90).default("Slack de OWU: owu.uy/slack"),
    }),
  },
  alert: {
    category: "info",
    title: "Aviso",
    description: "Un anuncio imposible de ignorar (franjas amarillas, pulso).",
    params: z.object({
      title: z.string().trim().max(60).default("Foto grupal en 5 minutos"),
      body: z.string().trim().max(160).default("Nos juntamos en el escenario principal"),
    }),
  },
  notices: {
    category: "info",
    title: "Avisos",
    description: "Anuncios que rotan de a uno. Separados por |.",
    params: z.object({
      title: z.string().trim().max(40).default("Avisos"),
      lines: z
        .string()
        .trim()
        .max(1500)
        .default(
          "Guardarropa en planta baja, junto a acreditación | El coffee break es a las 18:25 en el hall | Las sesiones del open space se proponen en la grilla del lobby | Foto grupal a las 20:25 en el escenario"
        ),
      seconds: z.number().int().min(3).max(60).default(8),
    }),
  },
  ticker: {
    category: "info",
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
  marquee: {
    category: "info",
    title: "Marquesina",
    description: "Texto gigante desfilando en dos filas.",
    params: z.object({ text: z.string().trim().max(120).default("OWU CONF 2026 · Hecha por la comunidad") }),
  },
  steps: {
    category: "info",
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
  checkin: {
    category: "info",
    title: "Acreditación",
    description: "Los pasos de la recepción y el aviso de fotos, para la pantalla del lobby a las 14:30.",
    params: z.object({
      eyebrow: z.string().trim().max(60).default("Bienvenidos · 14:30 a 15:00"),
      step1: z.string().trim().max(90).default("Buscá tu nombre en la lista o mostrá tu entrada"),
      step2: z.string().trim().max(90).default("Retirá tu lanyard y los stickers"),
      step3: z.string().trim().max(90).default("Dejá el abrigo en guardarropa y pasá al hall"),
      photoNote: z
        .string()
        .trim()
        .max(160)
        .default("Hoy se sacan fotos y video. Si preferís no aparecer, pedí el sticker rojo en acreditación."),
    }),
  },
  badges: {
    category: "info",
    title: "Colores y stickers",
    description: "Qué significa cada lanyard y sticker. Formato: emoji Nombre: qué es | …",
    params: z.object({
      lines: z
        .string()
        .trim()
        .max(800)
        .default(
          "🟡 Lanyard amarillo: staff, preguntales lo que sea | 🔵 Lanyard azul: speakers y facilitadores | 🔴 Sticker rojo: sin fotos, por favor | 🟢 Sticker verde: es mi primera OWU, hablame | 🧉 Sticker mate: comparto mate | ⚫ Lanyard negro: sponsors"
        ),
    }),
  },
  facilities: {
    category: "info",
    title: "Servicios",
    description: "Dónde está cada cosa: baños, agua, café, guardarropa… Formato: emoji Nombre: dónde | …",
    params: z.object({
      title: z.string().trim().max(40).default("Dónde está cada cosa"),
      items: z
        .string()
        .trim()
        .max(1200)
        .default(
          "🚻 Baños: planta baja y primer piso | 💧 Agua: dispensers en el hall | ☕ Café: hall central, todo el día | 🎒 Guardarropa: junto a acreditación | 🤫 Sala silenciosa: primer piso, al fondo | ♿ Accesibilidad: ascensor junto a la escalera | 🩹 Primeros auxilios: preguntá al staff | 🔌 Cargadores: mesas del lobby"
        ),
    }),
  },
  food: {
    category: "info",
    title: "Coffee break",
    description: "Qué hay para comer y a qué hora. Formato: emoji Nombre: detalle | …",
    params: z.object({
      title: z.string().trim().max(40).default("Coffee break"),
      time: z.string().trim().max(5).default("18:25"),
      items: z
        .string()
        .trim()
        .max(1200)
        .default(
          "☕ Café y té | 🧉 Mate: traé el tuyo, hay agua caliente | 🥐 Medialunas | 🥪 Sándwiches | 🍎 Fruta | 🌱 Opción vegana: preguntá al staff | 🌾 Sin gluten: preguntá al staff | 🥤 Agua y jugos"
        ),
      note: z.string().trim().max(120).default("Usá los tachos de reciclaje. Gracias."),
    }),
  },
  emergency: {
    category: "info",
    title: "Emergencia",
    description: "Salidas, punto de encuentro y a quién avisar.",
    params: z.object({
      exits: z
        .string()
        .trim()
        .max(600)
        .default(
          "Salida principal por la puerta de acreditación | Salida lateral al fondo del hall | Escaleras: no uses el ascensor"
        ),
      meetingPoint: z.string().trim().max(80).default("Vereda de enfrente, sobre Víctor Soliño"),
      contact: z.string().trim().max(120).default("Cualquiera del staff con remera OWU"),
      phone: z.string().trim().max(12).default("911"),
    }),
  },
  transport: {
    category: "info",
    title: "Cómo volver",
    description: "Ómnibus, taxis y bici para volver a casa, con el QR al mapa.",
    params: z.object({
      address: z.string().trim().max(80).default("Sinergia Faro · Víctor Soliño 349"),
      bus: z.string().trim().max(160).default("Paradas en la rambla y en Río Negro. Consultá tu línea en la app STM."),
      taxi: z.string().trim().max(160).default("Punto de encuentro para taxis y apps: puerta principal."),
      bike: z.string().trim().max(160).default("Bicicletero adentro. La rambla te lleva a casi todos lados."),
    }),
  },
  weather: {
    category: "info",
    title: "Tiempo afuera",
    description: "Montevideo ahora y las próximas horas (Open-Meteo); útil antes de la salida.",
    params: z.object({}),
  },
  venue: {
    category: "info",
    title: "Estamos en",
    description: "Lugar, dirección y QR con cómo llegar.",
    params: z.object({
      name: z.string().trim().max(40).default("Sinergia Faro"),
      address: z.string().trim().max(80).default("Víctor Soliño 349 · Montevideo"),
      mapUrl: z.string().trim().max(300).default(""),
    }),
  },
  stands: {
    category: "info",
    title: "Stands",
    description: "Dónde está cada sponsor. Formato: Nombre: ubicación | …",
    params: z.object({
      eyebrow: z.string().trim().max(60).default("Pasá a saludar"),
      lines: z
        .string()
        .trim()
        .max(800)
        .default(
          "Sponsor uno: hall, junto a la entrada | Sponsor dos: hall, frente al café | Sponsor tres: primer piso | Comunidad OWU: mesa del lobby"
        ),
    }),
  },
  "lost-found": {
    category: "info",
    title: "Objetos perdidos",
    description: "Lo que apareció y dónde retirarlo. Objetos separados por |.",
    params: z.object({
      items: z
        .string()
        .trim()
        .max(600)
        .default("Campera negra | Cargador USB-C | Termo verde | Lentes de sol | Paraguas"),
      where: z.string().trim().max(60).default("Mesa de acreditación"),
    }),
  },
  conduct: {
    category: "info",
    title: "Código de conducta",
    description: "Tres reglas y a quién acudir.",
    params: z.object({
      l1: z.string().trim().max(120).default("Un entorno amigable, respetuoso e inclusivo para todas las personas."),
      l2: z.string().trim().max(120).default("Sin comentarios ofensivos, acoso, intimidación ni discriminación."),
      l3: z.string().trim().max(120).default("Los organizadores pueden pedirte que te retires si no lo respetás."),
      contact: z.string().trim().max(120).default("Si algo te incomoda, buscá a cualquiera del staff con remera OWU."),
    }),
  },
  feedback: {
    category: "info",
    title: "Encuesta",
    description: "Pedido de feedback con QR al formulario.",
    params: z.object({
      title: z.string().trim().max(60).default("¿Cómo la pasaste?"),
      subtitle: z.string().trim().max(160).default("Dos minutos y nos ayudás a que la próxima sea mejor."),
      url: z.string().trim().max(200).default("https://owu.uy/conf"),
    }),
  },
  checklist: {
    category: "info",
    title: "Antes de irte",
    description: "Lista de cierre que se va tildando sola.",
    params: z.object({
      title: z.string().trim().max(40).default("Antes de irte"),
      items: z
        .string()
        .trim()
        .max(800)
        .default(
          "Foto grupal en el escenario | Devolvé el lanyard en acreditación | Contestá la encuesta | Seguinos en @owu_uy | Afterparty: te esperamos"
        ),
    }),
  },
  // --- Sponsors ---
  sponsors: {
    category: "sponsors",
    title: "Sponsors",
    description: "Marquee de los sponsors 2026.",
    params: z.object({}),
  },
  sponsor: {
    category: "sponsors",
    title: "Sponsor destacado",
    description: "Un sponsor por vez, en grande.",
    params: z.object({ secondsPerSponsor: z.coerce.number().int().min(2).max(60).default(5) }),
  },
  "sponsor-wall": {
    category: "sponsors",
    title: "Pared de sponsors",
    description: "Todos los logos a la vez, con entrada escalonada.",
    params: z.object({}),
  },
  // --- Comunidad y recuerdos ---
  team: {
    category: "community",
    title: "Equipo",
    description: "Créditos: el equipo de OWU CONF 2026.",
    params: z.object({}),
  },
  history: {
    category: "community",
    title: "Historia",
    description: "De La Meetup I (2023) a OWU CONF (2026), en una línea de tiempo animada.",
    params: z.object({}),
  },
  alumni: {
    category: "community",
    title: "Speakers de OWU",
    description: "Las caras de quienes ya dieron charlas en OWU (contenido del sitio).",
    params: z.object({}),
  },
  moments: {
    category: "community",
    title: "Momentos",
    description: "Fotos de La Meetup III con movimiento lento (Ken Burns).",
    params: z.object({ secondsPerPhoto: z.coerce.number().int().min(3).max(60).default(6) }),
  },
  mosaic: {
    category: "community",
    title: "Mosaico",
    description: "Seis fotos de ediciones anteriores; van cambiando de a una.",
    params: z.object({}),
  },
  selfie: {
    category: "community",
    title: "Selfie",
    description: "Marco para sacarse fotos frente a la pantalla, con el hashtag.",
    params: z.object({
      hashtag: z.string().trim().max(30).default("#OWUCONF"),
      line: z.string().trim().max(60).default("Etiquetá a @owu_uy"),
    }),
  },
  meetups: {
    category: "community",
    title: "Próximos meetups",
    description: "La agenda real de la comunidad (meetup-bot) para el cierre: la comunidad sigue.",
    params: z.object({}),
  },
  pulse: {
    category: "community",
    title: "Somos",
    description: "Cuántos ya llegaron (Eventbrite, solo totales) más ideas y salas de la grilla. Se actualiza solo.",
    params: z.object({ title: z.string().trim().max(40).default("Ya somos") }),
  },
  numbers: {
    category: "community",
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
  quote: {
    category: "community",
    title: "Frase",
    description: "Una cita grande con su autor.",
    params: z.object({
      text: z.string().trim().max(200).default("Las mejores ideas aparecen cuando la comunidad se junta."),
      author: z.string().trim().max(60).default("OWU"),
    }),
  },
  community: {
    category: "community",
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
  promo: {
    category: "community",
    title: "Promo",
    description: "Cupón de un sponsor: oferta, código y letra chica.",
    params: z.object({
      sponsor: z.string().trim().max(30).default("Sponsor"),
      offer: z.string().trim().max(40).default("20% OFF"),
      code: z.string().trim().max(30).default("OWUCONF"),
      detail: z.string().trim().max(120).default("Mostrando este código en el local durante el evento"),
    }),
  },
  // --- Interactivo · celular ---
  "live-poll": {
    category: "interactive",
    title: "Encuesta en vivo",
    description: "La gente vota desde el celular (QR en pantalla) y las barras se mueven en vivo.",
    params: z.object({
      question: z.string().trim().max(120).default("¿Qué te trajo hoy a OWU CONF?"),
      options: z.string().trim().max(300).default("Aprender | Conocer gente | Las charlas | El mate"),
    }),
  },
  "multi-poll": {
    category: "interactive",
    title: "Encuesta múltiple",
    description: "Marcá todas las que apliquen; porcentaje sobre personas.",
    params: z.object({
      question: z.string().trim().max(120).default("¿Con qué trabajás?"),
      options: z
        .string()
        .trim()
        .max(400)
        .default("TypeScript | Python | Go | Rust | Java | .NET | Kotlin/Swift | Otro"),
    }),
  },
  "word-cloud": {
    category: "interactive",
    title: "Nube de palabras en vivo",
    description: "Cada persona manda palabras desde el celular; la nube crece en pantalla.",
    params: z.object({
      prompt: z.string().trim().max(120).default("OWU CONF en una palabra"),
    }),
  },
  "live-questions": {
    category: "interactive",
    title: "Preguntas del público",
    description: "Preguntas desde el celular con votos; las más votadas suben. Para el Q&A.",
    params: z.object({ title: z.string().trim().max(60).default("Preguntas para el escenario") }),
  },
  reactions: {
    category: "interactive",
    title: "Reacciones",
    description: "Emojis desde el celular que flotan por la pantalla, con contadores.",
    params: z.object({ title: z.string().trim().max(60).default("¿Cómo viene la charla?") }),
  },
  quiz: {
    category: "interactive",
    title: "Quiz en vivo",
    description: "Pregunta con cuatro opciones; se responde desde el celular y al terminar se revela quién acertó.",
    params: z.object({
      question: z.string().trim().max(140).default("¿En qué año se fundó OWU?"),
      a: z.string().trim().max(60).default("2019"),
      b: z.string().trim().max(60).default("2021"),
      c: z.string().trim().max(60).default("2023"),
      d: z.string().trim().max(60).default("2024"),
      answer: z.string().trim().max(1).default("C"),
      seconds: z.number().int().min(5).max(180).default(30),
    }),
  },
  "quiz-race": {
    category: "interactive",
    title: "Quiz por rondas",
    description:
      "Varias preguntas seguidas con tiempo y tabla de posiciones (estilo Kahoot). Formato: Pregunta: a, b, c, d = índice correcto (0-3) | …",
    params: z.object({
      questions: z
        .string()
        .trim()
        .max(2000)
        .default(
          "¿Qué significa OWU?: Open Web Uruguay, Otra Web Uruguaya, Open Workshop Uruguay, Objetos Web Únicos = 0 | ¿Dónde es OWU CONF 2026?: Antel Arena, Sinergia Faro, LATU, Teatro Solís = 1 | ¿Cuántos principios tiene el open space?: 2, 3, 4, 5 = 2 | ¿Qué toma Owy?: Café, Mate, Té, Agua = 1"
        ),
      seconds: z.number().int().min(8).max(90).default(20),
    }),
  },
  rating: {
    category: "interactive",
    title: "Puntuación",
    description: "Estrellas desde el celular: promedio e histograma en vivo. Para cerrar una charla.",
    params: z.object({ title: z.string().trim().max(80).default("¿Qué te pareció la charla?") }),
  },
  scale: {
    category: "interactive",
    title: "Escala",
    description: "De 0 a 100 desde el celular: promedio y distribución en vivo. ¿Qué tan de acuerdo estás?",
    params: z.object({
      statement: z.string().trim().max(120).default("La IA va a cambiar mi trabajo este año"),
      left: z.string().trim().max(30).default("Para nada"),
      right: z.string().trim().max(30).default("Totalmente"),
    }),
  },
  ranking: {
    category: "interactive",
    title: "Ranking",
    description: "Cada persona ordena las opciones en el celular; la pared suma puntos (Borda).",
    params: z.object({
      question: z.string().trim().max(120).default("¿Qué es lo más importante en un equipo?"),
      options: z.string().trim().max(300).default("Confianza | Buen código | Comunicación | Mate"),
    }),
  },
  guess: {
    category: "interactive",
    title: "Adiviná el número",
    description: "Todos mandan un número; al cerrar se revela la respuesta y quién estuvo más cerca.",
    params: z.object({
      question: z.string().trim().max(140).default("¿Cuántas personas hay hoy en OWU CONF?"),
      answer: z.number().int().min(0).max(1_000_000).default(180),
      seconds: z.number().int().min(10).max(600).default(45),
    }),
  },
  "pick-number": {
    category: "interactive",
    title: "Pensá un número",
    description: "Del 1 al 10 desde el celular; al cerrar, el histograma y el truco: casi siempre gana el 7.",
    params: z.object({ seconds: z.number().int().min(5).max(120).default(25) }),
  },
  buzzer: {
    category: "interactive",
    title: "Pulsador",
    description: "3, 2, 1, ¡ya! Quien aprieta primero en el celular aparece primero en pantalla, con su nombre.",
    params: z.object({ title: z.string().trim().max(60).default("¿Quién responde primero?") }),
  },
  "tap-race": {
    category: "interactive",
    title: "Carrera de toques",
    description: "Dos mitades de la sala tocan lo más rápido que pueden; gana la barra más larga.",
    params: z.object({
      title: z.string().trim().max(60).default("Izquierda vs derecha"),
      left: z.string().trim().max(24).default("Izquierda"),
      right: z.string().trim().max(24).default("Derecha"),
      seconds: z.number().int().min(5).max(60).default(15),
    }),
  },
  tug: {
    category: "interactive",
    title: "Cinchada",
    description: "Dos opiniones, una soga: cada toque tira para tu lado. Hasta que alguien cruza la línea.",
    params: z.object({
      question: z.string().trim().max(100).default("¿Qué es mejor?"),
      a: z.string().trim().max(24).default("Tabs"),
      b: z.string().trim().max(24).default("Espacios"),
    }),
  },
  "session-vote": {
    category: "interactive",
    title: "Votación de sesiones",
    description: "Las sesiones del muro se votan desde el celular (hasta N por persona); las más votadas suben.",
    params: z.object({
      title: z.string().trim().max(60).default("¿A cuál vas?"),
      max: z.number().int().min(1).max(5).default(1),
    }),
  },
  "open-mic": {
    category: "interactive",
    title: "Micrófono abierto",
    description: "Anotarse desde el celular para hablar (nombre y tema); la pared muestra la cola.",
    params: z.object({
      title: z.string().trim().max(60).default("Charlas relámpago: anotate"),
      minutes: z.number().int().min(1).max(30).default(5),
    }),
  },
  wall: {
    category: "interactive",
    title: "Muro de mensajes",
    description: "Mensajes cortos desde el celular que aparecen como post-its.",
    params: z.object({ prompt: z.string().trim().max(120).default("Dejá un mensaje para la comunidad") }),
  },
  story: {
    category: "interactive",
    title: "Historia colectiva",
    description: "Una palabra por persona, en orden de llegada: la pared arma la historia.",
    params: z.object({ opening: z.string().trim().max(80).default("Había una vez, en una conferencia,") }),
  },
  signatures: {
    category: "interactive",
    title: "Firmas",
    description: "Cada persona deja su nombre; el muro se llena de firmas. Para el cierre.",
    params: z.object({ title: z.string().trim().max(60).default("Estuvimos acá") }),
  },
  presence: {
    category: "interactive",
    title: "¡Presente!",
    description: "Un toque por celular, un punto por persona: cuántos somos.",
    params: z.object({ title: z.string().trim().max(60).default("¿Cuántos somos?") }),
  },
  origin: {
    category: "interactive",
    title: "¿De dónde venís?",
    description: "Cada persona elige su departamento; burbujas que crecen con la gente.",
    params: z.object({
      question: z.string().trim().max(120).default("¿De dónde venís?"),
      options: z.string().trim().max(600).default(DEPARTMENTS),
    }),
  },
  "mood-grid": {
    category: "interactive",
    title: "Mapa de ánimo",
    description: "Tocá un punto en dos ejes (energía × ánimo) desde el celular; la pared muestra la nube de puntos.",
    params: z.object({
      title: z.string().trim().max(80).default("¿Cómo venís?"),
      x: z.string().trim().max(40).default("Sin energía → con energía"),
      y: z.string().trim().max(40).default("Meh → feliz"),
    }),
  },
  pixel: {
    category: "interactive",
    title: "Pixel art",
    description: "Cada persona dibuja en una grilla de 16×16 en el celular; la pared arma la galería.",
    params: z.object({ prompt: z.string().trim().max(80).default("Dibujá a Owy (o lo que quieras)") }),
  },
  pairs: {
    category: "interactive",
    title: "Grupos al azar",
    description: "El celular te da un grupo (un animal); buscá a los tuyos. Para armar mesas o equipos.",
    params: z.object({
      title: z.string().trim().max(60).default("Buscá a tu grupo"),
      groups: z.number().int().min(2).max(10).default(5),
      instruction: z
        .string()
        .trim()
        .max(160)
        .default("Tocá el botón, mirá tu animal y juntate con los que tengan el mismo. Tienen dos minutos."),
    }),
  },
  draw: {
    category: "interactive",
    title: "Sorteo por celular",
    description: "La gente se anota con su nombre; al terminar la cuenta, la pared elige una persona al azar.",
    params: z.object({
      title: z.string().trim().max(60).default("Sorteo"),
      prize: z.string().trim().max(80).default("Una remera OWU"),
      seconds: z.number().int().min(10).max(600).default(60),
    }),
  },
  typing: {
    category: "interactive",
    title: "Carrera de tipeo",
    description: "Tipeá la frase lo más rápido posible; el celular mide el tiempo y la pared arma el ranking.",
    params: z.object({
      phrase: z.string().trim().max(80).default("git push --force-with-lease origin main"),
    }),
  },
  // --- Interactivo · en persona ---
  "stand-up": {
    category: "inperson",
    title: "Levantate si…",
    description: "Frases que rotan: quien se identifica se pone de pie. Energizante para grupos grandes.",
    params: z.object({
      statements: z
        .string()
        .trim()
        .max(1500)
        .default(
          "…es tu primera OWU CONF | …tomás mate todos los días | …usás Vim o Neovim | …programaste algo esta semana | …viniste desde fuera de Montevideo | …tu primer lenguaje fue Java | …hiciste deploy un viernes | …ya propusiste una sesión hoy"
        ),
      seconds: z.number().int().min(5).max(60).default(12),
    }),
  },
  corners: {
    category: "inperson",
    title: "Este lado o el otro",
    description: "Dos opciones, dos lados de la sala: la gente camina hacia su respuesta. Rota con temporizador.",
    params: z.object({
      pairs: z
        .string()
        .trim()
        .max(1200)
        .default(
          "Tabs vs Espacios | Backend vs Frontend | Café vs Mate | Remoto vs Oficina | Monolito vs Microservicios | Mac vs Linux"
        ),
      seconds: z.number().int().min(5).max(120).default(20),
    }),
  },
  columns: {
    category: "inperson",
    title: "Gráfico humano",
    description: "La sala se ordena en columnas según la respuesta. Formato: Pregunta: opción, opción | …",
    params: z.object({
      prompts: z
        .string()
        .trim()
        .max(1200)
        .default(
          "¿Cuántos años programando?: 0-2, 3-5, 6-10, más de 10 | ¿En qué trabajás?: Frontend, Backend, Datos, Infra, Otro | ¿Cómo llegaste hoy?: Caminando, Bici, Ómnibus, Auto"
        ),
      seconds: z.number().int().min(10).max(180).default(40),
    }),
  },
  "human-map": {
    category: "inperson",
    title: "Mapa humano",
    description: "La sala es Uruguay: pará donde naciste (o donde vivís) y mirá cómo queda el mapa.",
    params: z.object({
      prompt: z.string().trim().max(80).default("Pará en el lugar donde naciste"),
      north: z.string().trim().max(40).default("la entrada"),
      south: z.string().trim().max(40).default("el escenario"),
      seconds: z.number().int().min(20).max(300).default(90),
    }),
  },
  "line-up": {
    category: "inperson",
    title: "Fila humana",
    description: "Ordénense en una fila según la consigna, sin hablar. Consignas que rotan con temporizador.",
    params: z.object({
      prompts: z
        .string()
        .trim()
        .max(1200)
        .default(
          "Años programando, de menos a más | Distancia que viajaste hoy, de menos a más | Hora a la que te levantaste, de más temprano a más tarde | Cantidad de lenguajes que usaste este año | Mates que tomaste hoy"
        ),
      seconds: z.number().int().min(20).max(300).default(90),
    }),
  },
  rps: {
    category: "inperson",
    title: "Piedra, papel o tijera",
    description: "Torneo relámpago: quien pierde alienta a quien le ganó, hasta que queda una persona campeona.",
    params: z.object({
      rounds: z.number().int().min(2).max(10).default(6),
      seconds: z.number().int().min(10).max(120).default(25),
    }),
  },
  "human-bingo": {
    category: "inperson",
    title: "Bingo humano",
    description: "Encontrá a alguien que… nueve casilleros y un temporizador; quien completa una línea grita bingo.",
    params: z.object({
      traits: z
        .string()
        .trim()
        .max(1200)
        .default(
          "…trabaja en una startup | …tiene más de 10 años programando | …vino en bici | …contribuyó a open source | …da clases | …tiene un side project | …vino de otro departamento | …organiza una comunidad | …no es de tech"
        ),
      minutes: z.number().int().min(1).max(30).default(6),
    }),
  },
  wave: {
    category: "inperson",
    title: "La ola",
    description: "Una luz barre la pantalla de izquierda a derecha: cuando pasa por tu sector, te parás y gritás.",
    params: z.object({
      rounds: z.number().int().min(1).max(10).default(4),
      seconds: z.number().int().min(2).max(20).default(8),
    }),
  },
  clap: {
    category: "inperson",
    title: "Aplauso sincronizado",
    description: "Un metrónomo visual: la sala aplaude al pulso y cada vuelta va más rápido.",
    params: z.object({
      bpm: z.number().int().min(40).max(200).default(80),
      step: z.number().int().min(0).max(40).default(15),
      beats: z.number().int().min(2).max(8).default(8),
      rounds: z.number().int().min(1).max(12).default(6),
    }),
  },
  mirror: {
    category: "inperson",
    title: "Espejo",
    description: "De a dos: una persona guía y la otra copia sus movimientos; cambian de rol con el temporizador.",
    params: z.object({
      rounds: z.number().int().min(2).max(8).default(4),
      seconds: z.number().int().min(10).max(120).default(30),
    }),
  },
  "paper-planes": {
    category: "inperson",
    title: "Aviones de papel",
    description: "Escribí una pregunta, armá el avión, tiralo al escenario y agarrá otro. Pasos con temporizador.",
    params: z.object({
      steps: z
        .string()
        .trim()
        .max(600)
        .default(
          "✍️ Escribí una pregunta para el escenario en un papel: 60 | ✈️ Armá tu avión de papel: 60 | 🚀 ¡A volar! Tiralo hacia el escenario: 10 | 🙌 Agarrá uno del piso y leelo en voz alta si te lo piden: 30"
        ),
    }),
  },
  networking: {
    category: "inperson",
    title: "Speed networking",
    description: "Rondas con una pregunta cada una y campana de cambio; arranca al ponerla.",
    params: z.object({
      title: z.string().trim().max(40).default("Speed networking"),
      minutes: z.number().int().min(1).max(15).default(3),
      prompts: z
        .string()
        .trim()
        .max(1500)
        .default(
          "¿Qué estás construyendo ahora? | ¿Cuál fue tu primer lenguaje? | ¿Qué aprendiste este año que te cambió cómo trabajás? | ¿Qué comunidad te gustaría que exista en Uruguay? | ¿Qué herramienta no podés dejar de usar? | ¿Qué charla te gustaría dar algún día?"
        ),
    }),
  },
  icebreaker: {
    category: "inperson",
    title: "Rompehielos",
    description: "Preguntas que rotan para charlar con la persona de al lado.",
    params: z.object({
      title: z.string().trim().max(40).default("Mientras esperamos"),
      subtitle: z.string().trim().max(100).default("Contestala con la persona de al lado."),
      questions: z
        .string()
        .trim()
        .max(1500)
        .default(
          "¿Cuál fue tu primer lenguaje de programación? | ¿Tabs o espacios? | ¿Qué bug te hizo perder más horas? | ¿Qué proyecto te gustaría empezar este año? | ¿Con qué comunidad tech te identificás? | ¿Cuál es tu atajo de teclado favorito?"
        ),
      seconds: z.number().int().min(5).max(120).default(15),
    }),
  },
  stretch: {
    category: "inperson",
    title: "Pausa activa",
    description: "Estiramientos guiados con temporizador, uno por vez. Formato: emoji texto | …",
    params: z.object({
      moves: z
        .string()
        .trim()
        .max(800)
        .default(
          "🙆 Brazos arriba, estirá bien alto | 🙇 Cabeza a un lado y al otro, despacio | 🤸 Hombros: círculos hacia atrás | 🧘 Cerrá los ojos y respirá hondo | 🕺 Sacudí las piernas | 🙌 Choque de manos con la persona de al lado"
        ),
      seconds: z.number().int().min(5).max(60).default(15),
    }),
  },
  breathe: {
    category: "inperson",
    title: "Respirar",
    description: "Un minuto de respiración guiada entre bloques: 4 · 4 · 6.",
    params: z.object({
      title: z.string().trim().max(60).default("Un minuto para respirar"),
      subtitle: z.string().trim().max(120).default("Seguí el círculo. Después seguimos."),
    }),
  },
  // --- Juegos y humor ---
  trivia: {
    category: "games",
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
    category: "games",
    title: "Versus",
    description: "Dos mitades, la sala elige un lado a los gritos.",
    params: z.object({
      question: z.string().trim().max(60).default("¿Qué preferís?"),
      left: z.string().trim().max(24).default("Tabs"),
      right: z.string().trim().max(24).default("Spaces"),
    }),
  },
  wordle: {
    category: "games",
    title: "OWUrdle",
    description: "Un Wordle resuelto en pantalla. Palabra + intentos separados por |.",
    params: z.object({
      title: z.string().trim().max(40).default("La palabra del día"),
      word: z.string().trim().min(3).max(8).default("MATE"),
      guesses: z.string().trim().max(120).default("CAFE | META | TEMA"),
    }),
  },
  bingo: {
    category: "games",
    title: "Bingo",
    description: "Cartón de bingo de conferencia que se marca solo; canta bingo y reparte otro.",
    params: z.object({
      title: z.string().trim().max(40).default("Bingo OWU"),
      phrases: z
        .string()
        .trim()
        .max(2000)
        .default(
          "¿Se escucha? | Depende | En mi máquina anda | Lo hicimos con IA | Es legacy | Refactor pendiente | ¿Alguien tiene un cargador? | Pasame el mate | Eso es un tema para otra sesión | Lo resolvimos con un cron | Los tests estaban en verde | El wifi | Vamos a hacerlo simple | ¿Vieron la última de …? | Después te paso el link | Microservicios | Monolito | Kubernetes | Lo dejamos para la retro | Rust lo resuelve | Está en producción | Un momento que comparto pantalla | Sticker nuevo | Café | Nos vemos en el afterparty | Escalabilidad | ¿Preguntas? | Deuda técnica | Lo vi en un hilo | Vibe coding"
        ),
    }),
  },
  raffle: {
    category: "games",
    title: "Sorteo",
    description: "Gira por los nombres y cae en uno al azar, con confetti. Nombres separados por coma.",
    params: z.object({
      title: z.string().trim().max(40).default("Sorteo"),
      names: z.string().trim().max(3000).default("Ana, Bruno, Camila, Diego, Elena, Fede, Gabi, Hernán"),
    }),
  },
  wheel: {
    category: "games",
    title: "Ruleta",
    description: "Ruleta que gira sola y cae en un nombre. Nombres separados por coma.",
    params: z.object({
      title: z.string().trim().max(40).default("Ruleta"),
      names: z.string().trim().max(1500).default("Ana, Bruno, Camila, Diego, Elena, Fede, Gabi, Hernán, Inés, Juan"),
      loop: z.boolean().default(true),
    }),
  },
  coin: {
    category: "games",
    title: "Moneda",
    description: "Cara o cruz en la pantalla grande, con lo que digan las caras.",
    params: z.object({
      heads: z.string().trim().max(20).default("Tabs"),
      tails: z.string().trim().max(20).default("Spaces"),
    }),
  },
  scoreboard: {
    category: "games",
    title: "Marcador",
    description: "Dos equipos y sus puntos; para trivias y desafíos.",
    params: z.object({
      title: z.string().trim().max(40).default("Trivia OWU"),
      a: z.string().trim().max(24).default("Backend"),
      b: z.string().trim().max(24).default("Frontend"),
      scoreA: z.number().int().min(0).max(999).default(0),
      scoreB: z.number().int().min(0).max(999).default(0),
    }),
  },
  poll: {
    category: "games",
    title: "Encuesta",
    description: "Resultados de una votación a mano alzada, cargados a mano.",
    params: z.object({
      question: z.string().trim().max(120).default("¿Cuál es tu editor?"),
      options: z.string().trim().max(300).default("VS Code | Neovim | JetBrains | Otro"),
      votes: z.string().trim().max(100).default("34 | 12 | 9 | 5"),
    }),
  },
  captcha: {
    category: "games",
    title: "Captcha",
    description: "Seleccioná todas las imágenes con mate. Se resuelve solo.",
    params: z.object({}),
  },
  bsod: {
    category: "games",
    title: "Pantalla azul",
    description: "La pantalla azul de la muerte, versión OWU. Chiste para el break.",
    params: z.object({
      message: z
        .string()
        .trim()
        .max(200)
        .default("OWU CONF se encontró con un problema y necesita un coffee break. Estamos recolectando información."),
      code: z.string().trim().max(40).default("MATE_NOT_FOUND"),
    }),
  },
  update: {
    category: "games",
    title: "Actualizando",
    description: "Instalando OWU CONF 2026… no apagues la conferencia.",
    params: z.object({
      message: z.string().trim().max(120).default("No apagues el equipo. Esto puede tardar un coffee break."),
    }),
  },
  "hello-world": {
    category: "games",
    title: "Hello, World!",
    description: "El mismo programa en veinte lenguajes, tipeado en vivo.",
    params: z.object({}),
  },
  dvd: {
    category: "games",
    title: "DVD",
    description: "El logo rebota por la pantalla. Si toca una esquina, hay confetti.",
    params: z.object({}),
  },
  pong: {
    category: "games",
    title: "Pong",
    description: "Se juega solo. Y pierde, a propósito.",
    params: z.object({}),
  },
  // --- Visuales y música ---
  "now-playing": {
    category: "visuals",
    title: "Sonando",
    description:
      "Qué suena en el break, con el vinilo girando. Con Spotify conectado (botón en esta página) toma el tema en vivo; si no, lo que escribas acá.",
    params: z.object({
      song: z.string().trim().max(80).default("Cuando la cigarra canta"),
      artist: z.string().trim().max(80).default("Jorge Drexler"),
      playlist: z.string().trim().max(60).default("Playlist OWU · break"),
      spotify: z.boolean().default(true),
    }),
  },
  equalizer: {
    category: "visuals",
    title: "Ecualizador",
    description: "Barras que siguen (o simulan seguir) la música del break.",
    params: z.object({ title: z.string().trim().max(60).default("Playlist OWU · break") }),
  },
  aurora: {
    category: "visuals",
    title: "Aurora",
    description: "Manchas de color de la marca flotando; fondo para el break.",
    params: z.object({}),
  },
  plasma: {
    category: "visuals",
    title: "Plasma",
    description: "El efecto plasma de los 90, en paleta OWU.",
    params: z.object({}),
  },
  tunnel: {
    category: "visuals",
    title: "Túnel",
    description: "Túnel infinito de la demoscene, texturas de la marca.",
    params: z.object({}),
  },
  fire: {
    category: "visuals",
    title: "Fuego",
    description: "El fuego de Doom (1993), llamas azules y amarillas.",
    params: z.object({}),
  },
  metaballs: {
    category: "visuals",
    title: "Metaballs",
    description: "Bolas de energía que se funden entre sí.",
    params: z.object({}),
  },
  voronoi: {
    category: "visuals",
    title: "Voronoi",
    description: "Celdas de Voronoi que se mueven; vitral animado.",
    params: z.object({}),
  },
  "reaction-diffusion": {
    category: "visuals",
    title: "Reacción–difusión",
    description: "Patrones de coral (Gray–Scott) creciendo en vivo.",
    params: z.object({}),
  },
  julia: {
    category: "visuals",
    title: "Julia",
    description: "Conjunto de Julia animado: fractales que respiran.",
    params: z.object({}),
  },
  "flow-field": {
    category: "visuals",
    title: "Campo de flujo",
    description: "Partículas surcando un campo vectorial que deriva.",
    params: z.object({}),
  },
  boids: {
    category: "visuals",
    title: "Boids",
    description: "Bandada de pájaros (Reynolds) en colores OWU.",
    params: z.object({}),
  },
  rotozoom: {
    category: "visuals",
    title: "Rotozoom",
    description: "Patrón de la marca girando y haciendo zoom, con el logo.",
    params: z.object({}),
  },
  terrain: {
    category: "visuals",
    title: "Terreno",
    description: "Sobrevuelo wireframe con sol retro; synthwave.",
    params: z.object({}),
  },
  ripples: {
    category: "visuals",
    title: "Ondas",
    description: "Anillos que se expanden desde puntos al azar.",
    params: z.object({}),
  },
  rays: {
    category: "visuals",
    title: "Rayos",
    description: "Sunburst girando detrás del logo; fondo de promo.",
    params: z.object({}),
  },
  network: {
    category: "visuals",
    title: "Red",
    description: "Nodos y conexiones: la constelación de la comunidad.",
    params: z.object({}),
  },
  blob: {
    category: "visuals",
    title: "Blob",
    description: "Formas orgánicas de la marca respirando.",
    params: z.object({}),
  },
  dragon: {
    category: "visuals",
    title: "Curva del dragón",
    description: "El fractal se dibuja segmento a segmento.",
    params: z.object({}),
  },
  wfc: {
    category: "visuals",
    title: "Circuito",
    description: "Wave function collapse: un circuito impreso que se resuelve solo.",
    params: z.object({}),
  },
  sand: {
    category: "visuals",
    title: "Arena",
    description: "Arena que cae y se apila, píxel a píxel.",
    params: z.object({}),
  },
  fireworks: {
    category: "visuals",
    title: "Fuegos artificiales",
    description: "Cohetes y explosiones; para cierres y anuncios.",
    params: z.object({ title: z.string().trim().max(40).default("") }),
  },
  "particle-text": {
    category: "visuals",
    title: "Texto de partículas",
    description: "Puntos que se juntan formando palabras y se dispersan. Palabras separadas por |.",
    params: z.object({ text: z.string().trim().max(200).default("OWU CONF | 2026 | COMUNIDAD | OPEN SPACE") }),
  },
  mystify: {
    category: "visuals",
    title: "Mystify",
    description: "El protector de pantalla de Windows, con estelas.",
    params: z.object({}),
  },
  pipes: {
    category: "visuals",
    title: "Cañerías",
    description: "Las cañerías del screensaver, en plano.",
    params: z.object({}),
  },
  "pendulum-wave": {
    category: "visuals",
    title: "Onda de péndulos",
    description: "16 péndulos con períodos distintos dibujando ondas.",
    params: z.object({}),
  },
  "double-pendulum": {
    category: "visuals",
    title: "Péndulo doble",
    description: "Dos péndulos casi iguales; el caos los separa.",
    params: z.object({}),
  },
  automaton: {
    category: "visuals",
    title: "Autómata",
    description: "Autómata celular de Wolfram (regla 30, 90, 110…) bajando por la pantalla.",
    params: z.object({
      rule: z.number().int().min(0).max(255).default(90),
      seed: z.enum(["azar", "centro"]).default("centro"),
    }),
  },
  langton: {
    category: "visuals",
    title: "Hormiga de Langton",
    description: "Tres hormigas con reglas simples construyendo autopistas.",
    params: z.object({}),
  },
  life: {
    category: "visuals",
    title: "Game of Life",
    description: "El autómata de Conway en colores OWU; se resiembra solo.",
    params: z.object({}),
  },
  maze: {
    category: "visuals",
    title: "Laberinto",
    description: "Se genera, se explora en BFS y se resuelve; y otra vez.",
    params: z.object({}),
  },
  raycaster: {
    category: "visuals",
    title: "Raycaster",
    description: "Paseo en primera persona por un laberinto, estilo 1992.",
    params: z.object({}),
  },
  sorting: {
    category: "visuals",
    title: "Ordenamiento",
    description: "Bubble, insertion, selection, quick y merge sort, en barras.",
    params: z.object({}),
  },
  donut: { category: "visuals", title: "Donut", description: "donut.c: el toro ASCII girando.", params: z.object({}) },
  cube: {
    category: "visuals",
    title: "Cubo",
    description: "Cubo 3D con las caras de la marca y el logo.",
    params: z.object({}),
  },
  neon: {
    category: "visuals",
    title: "Neón",
    description: "Cartel de neón que zumba y parpadea.",
    params: z.object({ text: z.string().trim().max(24).default("OWU CONF") }),
  },
  kinetic: {
    category: "visuals",
    title: "Tipografía cinética",
    description: "Palabras que golpean la pantalla una tras otra. Separadas por |.",
    params: z.object({
      words: z.string().trim().max(300).default("COMUNIDAD | CÓDIGO | MATE | OPEN SPACE | CHARLAS | OWU CONF"),
    }),
  },
  crawl: {
    category: "visuals",
    title: "Crawl",
    description: "El texto que se pierde en el espacio. Párrafos separados por |.",
    params: z.object({
      title: z.string().trim().max(60).default("Episodio 2026"),
      text: z
        .string()
        .trim()
        .max(1200)
        .default(
          "Hace mucho tiempo, en una comunidad tech no tan lejana, un grupo de personas decidió juntarse a compartir lo que sabían. | Sin agenda cerrada: el programa lo escriben quienes vienen. Cada charla, cada mesa y cada mate suman. | Hoy la conferencia vuelve a Sinergia Faro. Que la fuerza (y el wifi) los acompañe."
        ),
    }),
  },
  halftone: {
    category: "visuals",
    title: "Semitono",
    description: "Grilla de puntos que respira con ondas.",
    params: z.object({}),
  },
  shapes: {
    category: "visuals",
    title: "Formas",
    description: "Salvapantallas generativo con la geometría de la marca.",
    params: z.object({}),
  },
  tangram: {
    category: "visuals",
    title: "Tangram",
    description: "El collage de fotos de /conf armándose en la pared y mezclándose.",
    params: z.object({}),
  },
  kaleidoscope: {
    category: "visuals",
    title: "Caleidoscopio",
    description: "Formas de la marca reflejadas ocho veces. Hipnótico para las pausas.",
    params: z.object({}),
  },
  rain: {
    category: "visuals",
    title: "Lluvia de código",
    description: "Caracteres cayendo en amarillo y azul con el logo en el medio.",
    params: z.object({}),
  },
  warp: {
    category: "visuals",
    title: "Hiperespacio",
    description: "Estrellas hacia el logo. Para entrar al bloque de charlas.",
    params: z.object({}),
  },
  terminal: {
    category: "visuals",
    title: "Terminal",
    description: "La secuencia de arranque, tipeada en una terminal.",
    params: z.object({}),
  },
  // --- Utilidades ---
  "test-card": {
    category: "utility",
    title: "Carta de ajuste",
    description: "Barras de color y hora para probar la señal antes de abrir puertas.",
    params: z.object({}),
  },
  frame: {
    category: "utility",
    title: "Marco",
    description:
      "Overlay permanente: marco amarillo, logo y tira de sponsors. Capa superior en OBS con ?bg=transparent.",
    params: z.object({ label: z.string().trim().max(30).default("En vivo") }),
  },
  black: {
    category: "utility",
    title: "Negro",
    description: "Pantalla vacía.",
    params: z.object({}),
  },

  // --- Ágiles Uruguay 2026 (01 OCT 2026, #EVOLUCIONANDO) ---
  "agiles-logo": {
    category: "agiles",
    title: "Portada Ágiles",
    description: "La marca sobre la rambla: logo, fecha y hashtag. La pantalla de espera del día.",
    params: z.object({
      date: z.string().trim().max(40).default(AGILES_DATE),
      hashtag: z.string().trim().max(30).default(AGILES_HASHTAG),
      photo: z.boolean().default(true),
    }),
  },
  "agiles-welcome": {
    category: "agiles",
    title: "Bienvenida",
    description: "Título grande con sede, wifi y hashtag para la apertura de puertas.",
    params: z.object({
      title: z.string().trim().max(40).default("Bienvenidas y bienvenidos"),
      subtitle: z.string().trim().max(120).default("Un día para evolucionar juntas y juntos"),
      venue: z.string().trim().max(80).default("Auditorio San José · UCU"),
      wifi: z.string().trim().max(80).default(""),
      hashtag: z.string().trim().max(30).default(AGILES_HASHTAG),
    }),
  },
  "agiles-program": {
    category: "agiles",
    title: "Programa del día",
    description: "La agenda completa con el bloque actual resaltado según la hora.",
    params: z.object({
      title: z.string().trim().max(40).default("Programa"),
      items: z.string().trim().max(1400).default(AGILES_PROGRAM),
    }),
  },
  "agiles-now": {
    category: "agiles",
    title: "Ahora y a continuación",
    description: "Pantalla grande con el bloque en curso y el que sigue, calculados del programa.",
    params: z.object({ items: z.string().trim().max(1400).default(AGILES_PROGRAM) }),
  },
  "agiles-speaker": {
    category: "agiles",
    title: "Quién habla",
    description: "Ficha de la charla: nombre, rol, título, hora y sala. También sirve de zócalo.",
    params: z.object({
      name: z.string().trim().max(60).default("Federico Toledo"),
      role: z.string().trim().max(80).default(""),
      talk: z.string().trim().max(140).default("¿Cómo evoluciona la Agilidad en la era de la IA?"),
      time: z.string().trim().max(20).default("20:15 – 20:45"),
      room: z.string().trim().max(40).default(""),
    }),
  },
  "agiles-break": {
    category: "agiles",
    title: "Pausa",
    description: "Cuenta regresiva hasta la hora de volver, con el reloj gigante.",
    params: z.object({
      title: z.string().trim().max(40).default("Volvemos en"),
      until: z
        .string()
        .trim()
        .regex(/^\d{1,2}:\d{2}$/)
        .default("20:15"),
      note: z.string().trim().max(120).default("¡Recarguemos energías!"),
    }),
  },
  "agiles-message": {
    category: "agiles",
    title: "Aviso",
    description: "Un mensaje grande sobre la marca, para lo que haya que anunciar.",
    params: z.object({
      eyebrow: z.string().trim().max(30).default("Aviso"),
      title: z.string().trim().max(80).default("Nos vemos en la sala principal"),
      text: z.string().trim().max(200).default(""),
    }),
  },
  "agiles-sponsors": {
    category: "agiles",
    title: "Aliados y sponsors",
    description: "Las organizaciones que hacen posible el evento, en tarjetas de marca.",
    params: z.object({
      title: z.string().trim().max(40).default("Aliados y sponsors"),
      items: z.string().trim().max(600).default(AGILES_SPONSORS),
    }),
  },
  "agiles-social": {
    category: "agiles",
    title: "Hashtag y redes",
    description: "El hashtag a pantalla completa con las cuentas y un QR opcional.",
    params: z.object({
      hashtag: z.string().trim().max(30).default(AGILES_HASHTAG),
      accounts: z.string().trim().max(200).default("@agilesuy | Ágiles Uruguay | agiles.uy"),
      url: z.string().trim().max(200).default(""),
    }),
  },
  "agiles-closing": {
    category: "agiles",
    title: "Cierre",
    description: "Gracias, hashtag y la invitación a seguir en contacto.",
    params: z.object({
      title: z.string().trim().max(40).default("¡Gracias!"),
      text: z
        .string()
        .trim()
        .max(160)
        .default("La seguimos en Cantina Bombín, a 4 cuadras: ¡para seguir conectando y conversando!"),
      hashtag: z.string().trim().max(30).default(AGILES_HASHTAG),
    }),
  },

  // --- Ágiles · Open space ---
  "agiles-os-intro": {
    category: "agilesOpenSpace",
    title: "Qué es un Open Space",
    description: "La explicación corta antes del marketplace, con la ley de los dos pies.",
    params: z.object({
      title: z.string().trim().max(40).default("Open Space"),
      text: z
        .string()
        .trim()
        .max(300)
        .default("La agenda la armamos entre todas y todos: quien propone, facilita; quien participa, elige."),
      law: z.string().trim().max(160).default("Ley de los dos pies: si no aprendés ni aportás, movete a otra sesión."),
    }),
  },
  "agiles-os-principles": {
    category: "agilesOpenSpace",
    title: "Principios",
    description: "Los cuatro principios del open space en tarjetas numeradas.",
    params: z.object({ items: z.string().trim().max(600).default(AGILES_OS_PRINCIPLES) }),
  },
  "agiles-os-marketplace": {
    category: "agilesOpenSpace",
    title: "Marketplace",
    description: "Los pasos para proponer una sesión, mientras la gente arma la grilla.",
    params: z.object({
      title: z.string().trim().max(40).default("Proponé tu sesión"),
      items: z.string().trim().max(600).default(AGILES_OS_STEPS),
    }),
  },
  "agiles-os-board": {
    category: "agilesOpenSpace",
    title: "Grilla en vivo",
    description: "La grilla del evento (salas × bloques) en vivo desde el admin, con la marca de Ágiles.",
    params: z.object({ title: z.string().trim().max(40).default("Grilla") }),
  },
  "agiles-os-room": {
    category: "agilesOpenSpace",
    title: "Sala",
    description: "El programa de una sala, para la pantalla o el cartel de la puerta.",
    params: z.object({ room: z.string().trim().max(40).default("Sala 1") }),
  },
  "agiles-os-rounds": {
    category: "agilesOpenSpace",
    title: "Rondas",
    description: "Las rondas del open space con el reloj marcando la que corre y lo que falta.",
    params: z.object({ rounds: z.string().trim().max(300).default(AGILES_OS_ROUNDS) }),
  },
  "agiles-os-closing": {
    category: "agilesOpenSpace",
    title: "Cierre del open space",
    description: "Las preguntas de la ronda de cierre, para la última media hora.",
    params: z.object({
      title: z.string().trim().max(40).default("Ronda de cierre"),
      items: z.string().trim().max(400).default(AGILES_OS_CLOSING),
    }),
  },
} as const satisfies Record<
  string,
  { title: string; description: string; category: SceneCategory; params: z.ZodTypeAny }
>;

export type SceneId = keyof typeof SCENES;
export const SCENE_IDS = Object.keys(SCENES) as SceneId[];
/** Registry order is display order: categories in the day's flow, scenes by usefulness within each. */
export const SCENE_GROUPS = SCENE_CATEGORY_IDS.map((category) => ({
  category,
  title: SCENE_CATEGORIES[category].title,
  scenes: SCENE_IDS.filter((id) => SCENES[id].category === category),
}));
export type SceneParams<K extends SceneId> = z.infer<(typeof SCENES)[K]["params"]>;
/** What a scene component receives: its validated params plus the wall's working event. */
export type SceneProps<K extends SceneId> = {
  params: SceneParams<K>;
  eventId: string | null;
  round: string;
  /** ISO time of the take (see StageState.takenAt). */
  takenAt: string;
};

export function isSceneId(value: string): value is SceneId {
  return value in SCENES;
}

export const EFFECTS = ["confetti", "flash", "owy-happy", "caption", "emoji"] as const;
export type EffectId = (typeof EFFECTS)[number];

export const FACE_STATES = ["idle", "listening", "thinking", "speaking", "happy", "error", "offline"] as const;
export type FaceState = (typeof FACE_STATES)[number];

/** Owy's per-sentence feelings (owy/companion/firmware/companion_model.h), hinted over the face state. */
export const EXPRESSIONS = [
  "neutral",
  "happy",
  "excited",
  "curious",
  "thinking",
  "empathetic",
  "playful",
  "surprised",
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** A talk that just landed on the board, as the companion announces it. */
export const FaceCardSchema = z.object({
  title: z.string().trim().min(1).max(200),
  speaker: z.string().trim().max(200).optional(),
  room: z.string().trim().max(80).optional(),
  timeSlot: z.string().trim().max(40).optional(),
  reasoning: z.string().trim().max(500).optional(),
});
export type FaceCard = z.infer<typeof FaceCardSchema>;

export const FaceEventSchema = z.object({
  state: z.enum(FACE_STATES),
  transcript: z
    .object({
      who: z.enum(["input", "output"]),
      /** A running total per speaker; a spoken pitch runs to ~1500 characters. */
      text: z.string().trim().max(2000),
    })
    .optional(),
  /** A feeling over the state, what the device's face does per sentence; it fades on the wall. */
  expression: z
    .object({ name: z.enum(EXPRESSIONS), strength: z.number().int().min(0).max(100).default(100) })
    .optional(),
  /** "The card landed": the wall shows it with its place. */
  card: FaceCardSchema.optional(),
  /** Which Owy produced it (device id / web session); informational. */
  source: z.string().max(80).optional(),
});
export type FaceEvent = z.infer<typeof FaceEventSchema>;

/** The face as kept on the stage row: the last state, feeling and card — never the transcript. */
export const StoredFaceSchema = FaceEventSchema.omit({ transcript: true }).extend({ at: z.string() });
export type StoredFace = z.infer<typeof StoredFaceSchema>;

export const StageStateSchema = z.object({
  scene: z.enum(SCENE_IDS as [SceneId, ...SceneId[]]),
  params: z.record(z.string(), z.unknown()).default({}),
  eventId: z.string().nullable().default(null),
  /** Changes on every take; interactive scenes key their phone inputs on it. */
  round: z.string().default(""),
  /** ISO time of the take, so wall and phones agree on timers. */
  takenAt: z.string().default(""),
  /** Owy's last face, so a wall that connects mid-conversation catches up. */
  face: StoredFaceSchema.nullable().default(null),
});
export type StageState = z.infer<typeof StageStateSchema>;

export const DEFAULT_STAGE_STATE: StageState = {
  scene: "black",
  params: {},
  eventId: null,
  round: "",
  takenAt: "",
  face: null,
};

/**
 * The rundown: the order the wall walks through on the day. One row per take,
 * with the seconds it stays on air — `0` means "hold here until I say next".
 * Stored on the stage row so any admin device edits the same list.
 */
export const RundownStepSchema = z.object({
  id: z.string().min(1).max(40),
  scene: z.enum(SCENE_IDS as [SceneId, ...SceneId[]]),
  sec: z.number().int().min(0).max(7200).default(20),
  params: z.record(z.string(), z.unknown()).default({}),
});
export const RundownSchema = z.array(RundownStepSchema).max(80);
export type RundownStep = z.infer<typeof RundownStepSchema>;

/** Scenes that take input from phones at /owy/play. */
export const INTERACTIVE_SCENES = [
  "live-poll",
  "word-cloud",
  "live-questions",
  "reactions",
  "quiz",
  "rating",
  "guess",
  "buzzer",
  "session-vote",
  "scale",
  "ranking",
  "wall",
  "multi-poll",
  "origin",
  "presence",
  "signatures",
  "pairs",
  "tap-race",
  "pixel",
  "mood-grid",
  "quiz-race",
  "open-mic",
  "tug",
  "pick-number",
  "draw",
  "typing",
  "story",
] as const satisfies readonly SceneId[];

export const InputModeSchema = z.enum(["single", "multi", "once"]);
export const SubmitInputSchema = z.object({
  round: z.string().trim().min(1).max(40),
  key: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(140),
  voter: z.string().trim().min(1).max(40),
  mode: InputModeSchema.default("single"),
});
export type SubmitInput = z.infer<typeof SubmitInputSchema>;
export type StageInput = { id: string; key: string; value: string; voter: string; createdAt: string };
export type InputEvent = StageInput & { round: string; mode: z.infer<typeof InputModeSchema> };

export const EffectEventSchema = z.object({
  effect: z.enum(EFFECTS),
  payload: z
    .object({ text: z.string().trim().max(200) })
    .partial()
    .optional(),
});
export type EffectEvent = z.infer<typeof EffectEventSchema>;

/** Parse scene params against the scene's schema, applying defaults. */
export function parseSceneParams<K extends SceneId>(scene: K, params: unknown): SceneParams<K> {
  return SCENES[scene].params.parse(params ?? {}) as SceneParams<K>;
}
