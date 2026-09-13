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
  // --- Generativos (demoscene, creative coding) ---
  plasma: { title: "Plasma", description: "El efecto plasma de los 90, en paleta OWU.", params: z.object({}) },
  tunnel: {
    title: "Túnel",
    description: "Túnel infinito de la demoscene, texturas de la marca.",
    params: z.object({}),
  },
  fire: { title: "Fuego", description: "El fuego de Doom (1993), llamas azules y amarillas.", params: z.object({}) },
  metaballs: { title: "Metaballs", description: "Bolas de energía que se funden entre sí.", params: z.object({}) },
  voronoi: { title: "Voronoi", description: "Celdas de Voronoi que se mueven; vitral animado.", params: z.object({}) },
  "reaction-diffusion": {
    title: "Reacción–difusión",
    description: "Patrones de coral (Gray–Scott) creciendo en vivo.",
    params: z.object({}),
  },
  julia: { title: "Julia", description: "Conjunto de Julia animado: fractales que respiran.", params: z.object({}) },
  "flow-field": {
    title: "Campo de flujo",
    description: "Partículas surcando un campo vectorial que deriva.",
    params: z.object({}),
  },
  boids: { title: "Boids", description: "Bandada de pájaros (Reynolds) en colores OWU.", params: z.object({}) },
  rotozoom: {
    title: "Rotozoom",
    description: "Patrón de la marca girando y haciendo zoom, con el logo.",
    params: z.object({}),
  },
  terrain: { title: "Terreno", description: "Sobrevuelo wireframe con sol retro; synthwave.", params: z.object({}) },
  ripples: { title: "Ondas", description: "Anillos que se expanden desde puntos al azar.", params: z.object({}) },
  rays: { title: "Rayos", description: "Sunburst girando detrás del logo; fondo de promo.", params: z.object({}) },
  network: { title: "Red", description: "Nodos y conexiones: la constelación de la comunidad.", params: z.object({}) },
  blob: { title: "Blob", description: "Formas orgánicas de la marca respirando.", params: z.object({}) },
  dragon: { title: "Curva del dragón", description: "El fractal se dibuja segmento a segmento.", params: z.object({}) },
  wfc: {
    title: "Circuito",
    description: "Wave function collapse: un circuito impreso que se resuelve solo.",
    params: z.object({}),
  },
  sand: { title: "Arena", description: "Arena que cae y se apila, píxel a píxel.", params: z.object({}) },
  fireworks: {
    title: "Fuegos artificiales",
    description: "Cohetes y explosiones; para cierres y anuncios.",
    params: z.object({ title: z.string().trim().max(40).default("") }),
  },
  "particle-text": {
    title: "Texto de partículas",
    description: "Puntos que se juntan formando palabras y se dispersan. Palabras separadas por |.",
    params: z.object({ text: z.string().trim().max(200).default("OWU CONF | 2026 | COMUNIDAD | OPEN SPACE") }),
  },
  // --- Simulaciones y clásicos ---
  mystify: { title: "Mystify", description: "El protector de pantalla de Windows, con estelas.", params: z.object({}) },
  pipes: { title: "Cañerías", description: "Las cañerías del screensaver, en plano.", params: z.object({}) },
  "pendulum-wave": {
    title: "Onda de péndulos",
    description: "16 péndulos con períodos distintos dibujando ondas.",
    params: z.object({}),
  },
  "double-pendulum": {
    title: "Péndulo doble",
    description: "Dos péndulos casi iguales; el caos los separa.",
    params: z.object({}),
  },
  automaton: {
    title: "Autómata",
    description: "Autómata celular de Wolfram (regla 30, 90, 110…) bajando por la pantalla.",
    params: z.object({
      rule: z.number().int().min(0).max(255).default(90),
      seed: z.enum(["azar", "centro"]).default("centro"),
    }),
  },
  langton: {
    title: "Hormiga de Langton",
    description: "Tres hormigas con reglas simples construyendo autopistas.",
    params: z.object({}),
  },
  maze: {
    title: "Laberinto",
    description: "Se genera, se explora en BFS y se resuelve; y otra vez.",
    params: z.object({}),
  },
  raycaster: {
    title: "Raycaster",
    description: "Paseo en primera persona por un laberinto, estilo 1992.",
    params: z.object({}),
  },
  sorting: {
    title: "Ordenamiento",
    description: "Bubble, insertion, selection, quick y merge sort, en barras.",
    params: z.object({}),
  },
  pong: { title: "Pong", description: "Se juega solo. Y pierde, a propósito.", params: z.object({}) },
  // --- Tipográficos y 3D ---
  donut: { title: "Donut", description: "donut.c: el toro ASCII girando.", params: z.object({}) },
  cube: { title: "Cubo", description: "Cubo 3D con las caras de la marca y el logo.", params: z.object({}) },
  neon: {
    title: "Neón",
    description: "Cartel de neón que zumba y parpadea.",
    params: z.object({ text: z.string().trim().max(24).default("OWU CONF") }),
  },
  kinetic: {
    title: "Tipografía cinética",
    description: "Palabras que golpean la pantalla una tras otra. Separadas por |.",
    params: z.object({
      words: z.string().trim().max(300).default("COMUNIDAD | CÓDIGO | MATE | OPEN SPACE | CHARLAS | OWU CONF"),
    }),
  },
  crawl: {
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
  credits: {
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
  halftone: { title: "Semitono", description: "Grilla de puntos que respira con ondas.", params: z.object({}) },
  equalizer: {
    title: "Ecualizador",
    description: "Barras que siguen (o simulan seguir) la música del break.",
    params: z.object({ title: z.string().trim().max(60).default("Playlist OWU · break") }),
  },
  "hello-world": {
    title: "Hello, World!",
    description: "El mismo programa en veinte lenguajes, tipeado en vivo.",
    params: z.object({}),
  },
  bsod: {
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
  // --- Interactivos y útiles ---
  poll: {
    title: "Encuesta",
    description: "Resultados de una votación a mano alzada, cargados a mano.",
    params: z.object({
      question: z.string().trim().max(120).default("¿Cuál es tu editor?"),
      options: z.string().trim().max(300).default("VS Code | Neovim | JetBrains | Otro"),
      votes: z.string().trim().max(100).default("34 | 12 | 9 | 5"),
    }),
  },
  wheel: {
    title: "Ruleta",
    description: "Ruleta que gira sola y cae en un nombre. Nombres separados por coma.",
    params: z.object({
      title: z.string().trim().max(40).default("Ruleta"),
      names: z.string().trim().max(1500).default("Ana, Bruno, Camila, Diego, Elena, Fede, Gabi, Hernán, Inés, Juan"),
      loop: z.boolean().default(true),
    }),
  },
  coin: {
    title: "Moneda",
    description: "Cara o cruz en la pantalla grande, con lo que digan las caras.",
    params: z.object({
      heads: z.string().trim().max(20).default("Tabs"),
      tails: z.string().trim().max(20).default("Spaces"),
    }),
  },
  scoreboard: {
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
  "talk-timer": {
    title: "Timer de charla",
    description: "Cuenta regresiva para quien habla: arranca al ponerla en pantalla, avisa al final.",
    params: z.object({
      title: z.string().trim().max(40).default("Tiempo de charla"),
      minutes: z.number().int().min(1).max(180).default(20),
      warn: z.number().int().min(0).max(60).default(5),
    }),
  },
  "traffic-light": {
    title: "Semáforo",
    description: "Señal para quien habla: verde, amarillo o rojo, con su mensaje.",
    params: z.object({
      state: z.enum(["verde", "amarillo", "rojo"]).default("verde"),
      green: z.string().trim().max(40).default("Adelante"),
      yellow: z.string().trim().max(40).default("Últimos 5 minutos"),
      red: z.string().trim().max(40).default("Tiempo"),
    }),
  },
  wordle: {
    title: "OWUrdle",
    description: "Un Wordle resuelto en pantalla. Palabra + intentos separados por |.",
    params: z.object({
      title: z.string().trim().max(40).default("La palabra del día"),
      word: z.string().trim().min(3).max(8).default("MATE"),
      guesses: z.string().trim().max(120).default("CAFE | META | TEMA"),
    }),
  },
  pipeline: {
    title: "Pipeline",
    description: "El programa del día como un pipeline de CI: qué pasó, qué corre, qué falta.",
    params: z.object({ items: z.string().trim().max(1200).default(DEFAULT_PROGRAM) }),
  },
  update: {
    title: "Actualizando",
    description: "Instalando OWU CONF 2026… no apagues la conferencia.",
    params: z.object({
      message: z.string().trim().max(120).default("No apagues el equipo. Esto puede tardar un coffee break."),
    }),
  },
  captcha: {
    title: "Captcha",
    description: "Seleccioná todas las imágenes con mate. Se resuelve solo.",
    params: z.object({}),
  },
  // --- Servicio: para el día ---
  rounds: {
    title: "Rondas del open space",
    description: "Ronda actual, tiempo restante y las que faltan; el reloj facilita solo. Formato HH:MM-HH:MM | …",
    params: z.object({
      title: z.string().trim().max(40).default("Open space"),
      rounds: z.string().trim().max(300).default("16:00-16:40 | 16:45-17:25 | 17:30-18:10"),
    }),
  },
  "now-bar": {
    title: "Barra ahora / sigue",
    description:
      "Lower third con el bloque actual, el siguiente y la hora, según el programa. Para cámaras con ?bg=transparent.",
    params: z.object({ items: z.string().trim().max(1200).default(DEFAULT_PROGRAM) }),
  },
  notices: {
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
  changes: {
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
  facilities: {
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
  emergency: {
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
    title: "Cómo volver",
    description: "Ómnibus, taxis y bici para volver a casa, con el QR al mapa.",
    params: z.object({
      address: z.string().trim().max(80).default("Sinergia Faro · Víctor Soliño 349"),
      bus: z.string().trim().max(160).default("Paradas en la rambla y en Río Negro. Consultá tu línea en la app STM."),
      taxi: z.string().trim().max(160).default("Punto de encuentro para taxis y apps: puerta principal."),
      bike: z.string().trim().max(160).default("Bicicletero adentro. La rambla te lleva a casi todos lados."),
    }),
  },
  food: {
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
  feedback: {
    title: "Encuesta",
    description: "Pedido de feedback con QR al formulario.",
    params: z.object({
      title: z.string().trim().max(60).default("¿Cómo la pasaste?"),
      subtitle: z.string().trim().max(160).default("Dos minutos y nos ayudás a que la próxima sea mejor."),
      url: z.string().trim().max(200).default("https://owu.uy/conf"),
    }),
  },
  checklist: {
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
  grid: {
    title: "Grilla del open space",
    description: "La grilla salas × horarios con las sesiones del muro, en vivo; resalta el bloque en curso.",
    params: z.object({}),
  },
  checkin: {
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
  stands: {
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
  live: {
    title: "En vivo",
    description: "Aviso de transmisión con QR: para quien no pudo venir.",
    params: z.object({
      title: z.string().trim().max(60).default("Estamos transmitiendo"),
      subtitle: z.string().trim().max(140).default("Compartilo con quien no pudo venir: las charlas se ven en vivo."),
      url: z.string().trim().max(200).default("https://www.youtube.com/@owuuy"),
    }),
  },
  weather: {
    title: "Tiempo afuera",
    description: "Montevideo ahora y las próximas horas (Open-Meteo); útil antes de la salida.",
    params: z.object({}),
  },
  timeline: {
    title: "Línea del día",
    description: "Barra del día completo con la aguja de la hora: cuánto va y cuánto falta.",
    params: z.object({
      title: z.string().trim().max(40).default("Así va el día"),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
      end: z.string().trim().max(5).default("20:40"),
    }),
  },
  reminders: {
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
  lightning: {
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
  hosts: {
    title: "Quiénes facilitan",
    description: "Los nombres de quienes proponen sesiones, en vivo desde el muro.",
    params: z.object({}),
  },
  "room-cards": {
    title: "Las salas",
    description: "Cada sala como cartel: color, ícono, capacidad, pantalla y pizarra; desde la base.",
    params: z.object({}),
  },
  topics: {
    title: "De qué se habla",
    description: "Nube de palabras armada con los títulos de las sesiones del muro.",
    params: z.object({}),
  },
  links: {
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
  "wifi-qr": {
    title: "Wi-Fi con QR",
    description: "Red y contraseña, más el QR que conecta el celular solo.",
    params: z.object({
      network: z.string().trim().max(40).default("OWU-CONF"),
      password: z.string().trim().max(60).default("comunidad2026"),
    }),
  },
  alumni: {
    title: "Speakers de OWU",
    description: "Las caras de quienes ya dieron charlas en OWU (contenido del sitio).",
    params: z.object({}),
  },
  breathe: {
    title: "Respirar",
    description: "Un minuto de respiración guiada entre bloques: 4 · 4 · 6.",
    params: z.object({
      title: z.string().trim().max(60).default("Un minuto para respirar"),
      subtitle: z.string().trim().max(120).default("Seguí el círculo. Después seguimos."),
    }),
  },
  bingo: {
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
  "now-playing": {
    title: "Sonando",
    description: "Qué suena en el break: tema, artista y playlist, con el vinilo girando.",
    params: z.object({
      song: z.string().trim().max(80).default("Cuando la cigarra canta"),
      artist: z.string().trim().max(80).default("Jorge Drexler"),
      playlist: z.string().trim().max(60).default("Playlist OWU · break"),
    }),
  },
  departures: {
    title: "Panel de salidas",
    description: "El programa como el panel de un aeropuerto: letras que giran y estado de cada bloque.",
    params: z.object({
      title: z.string().trim().max(30).default("OWU CONF · Salidas"),
      items: z.string().trim().max(1200).default(DEFAULT_PROGRAM),
    }),
  },
  networking: {
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
