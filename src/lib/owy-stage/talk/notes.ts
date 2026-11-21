/**
 * Presenter notes for «Owy, en vivo», by slide id: only the console imports this, so it stays
 * out of the public stage bundle. Stage directions, what to say, and what to do if it breaks.
 * Each click of the clicker is one build: the notes say what each click shows.
 */
export const TALK_NOTES: Record<string, string> = {
  lobby:
    "Antes de abrir puertas: el clicker enchufado a la Mac y esta pestaña con foco (el punto verde arriba). Owy conectado. A T-1:00, cue «Aviso».",
  wake: "Luces. No digas nada: Owy arranca solo (cue auto). Cuando te pregunta «¿Arrancás, Agus?», entrás con el mic.",
  title:
    "Presentate y presentalo. «Hoy les muestro cómo se conecta todo lo que están usando: la grilla, el backoffice, las pantallas y Owy, y cómo lo construí con agentes.» Pueden preguntar desde el celular en cualquier momento.",
  paper: "Click 1: la grilla de papel. Click 2: «y alguien la pasa a mano». Ese alguien eras vos. De ahí sale todo.",
  map: "El mapa al que vamos a volver. Un click por pieza: 1 owu.uy (API, Postgres, realtime) · 2 OWU Ops · 3 celulares · 4 kiosks y wall · 5 Owy · 6 Slack y Telegram · 7 bridge y perilla · 8 AI Gateway · 9 un cambio cruza el mapa (dejalo correr). Al final, cue «Chiste del mapa».",
  "door-agenda": "Puerta de capítulo: la fila de arriba. «Una sola grilla, en cuatro pantallas.» Seguí.",
  "agenda-admin":
    "Click 0: la pantalla entera. 1: arrastrar y soltar (la otra tarjeta se corre; también con teclado). 2: el inspector y «Cambios», donde queda lo que hizo Owy. 3: Sugerir con IA.",
  ai: "Tres clicks. En «Sugerir con IA» remarcá: el modelo no elige la celda, contesta sí o no y el lugar sale de una cuenta. Si duda, decide otro modelo.",
  "agenda-phones":
    "Click 1: el staff edita desde el celular. Click 2: la página pública, sin login. Mismos datos, en vivo.",
  kiosk: "La tele de cada sala. Click: el bloque de ahora. «Si muevo una tarjeta, esta tele se entera sola.»",
  "door-ops": "Puerta: OWU Ops. «El día del evento, desde el celular.»",
  hoy: "Click 1: acreditados en vivo, cada 5 min. 2: ahora en salas, con el incidente al lado. 3: el guion del día y GO.",
  tareas:
    "Click 1: turnos con la línea de ahora; arrastrar una persona sobre otra cambia tareas. 2: quién llegó (botón «Llegué»).",
  "ops-phones":
    "Uno por click: Mi turno (deslizar), Incidentes (con foto; grave = aviso a todos), y que se instala como app.",
  scenes:
    "Click 1: preview → TAKE → al aire. 2: 219 escenas, «esta charla es una escena más». 3: los parámetros de cada escena. Si querés, mencioná los presets 1–9 y el Stream Deck.",
  "door-core": "Puerta: el medio del mapa. «Ahora, cómo se conecta todo.»",
  hub: "Click 1 quién escribe, 2 el centro, 3 quién escucha: ahí arranca el pulso. Si alguien del staff mueve una tarjeta de la grilla del wall, el bus se prende de verdad.",
  change:
    "Un mensaje por click: tracks.update → permiso → transacción → card_change → todas las pantallas a la vez → releen desde la caché. «Por eso el mismo cambio aparece en el celular, el kiosk y el wall.»",
  "door-owy": "Puerta: Owy. «Un agente con su propia llave.»",
  bodies: "Un cuerpo por click. El cerebro es uno solo; los cuerpos, muchos.",
  anatomy:
    "Una línea por click. Remarcá: es una carpeta en el repo, los mismos archivos para Slack, Telegram y la voz. Al final, cue «Chiste de la carpeta».",
  tools:
    "Una fila por click. La clave: Owy entra con su llave pero actúa por quien le habla; la API vuelve a chequear el permiso y lo audita «vía Owy».",
  slack:
    "Un mensaje por click. Remarcá el x-owu-actor: Owy no puede más que la persona. El último click cierra en el hilo de Slack.",
  "door-fisico": "Puerta: el cuerpo de Owy. «Una perilla, una Mac y un navegador.»",
  knob: "La perilla en vivo. «Es una cara y un botón: manda un toque, recibe la cara. El audio nunca viaja por el wifi.»",
  inside:
    "Una caja por click. Con todas a la vista, cue «Owy explica el diagrama»: las cajas se prenden solas mientras habla.",
  "one-face": "Tres clicks. El del WebAssembly es el lindo: el wall corre el mismo C++ que la perilla.",
  workflow:
    "Una estación por click. Contalo con un ejemplo real: esta charla. «Le pedí esto, me hizo preguntas, sacó las capturas con un navegador y me dejó un PR.»",
  prs: "Una rama por click (son PRs reales), el último click muestra los totales. Cue «Chiste de los colegas». Contá PRs, no líneas.",
  mcp: "Una fila por click. «MCP es lo que le da manos: un navegador, la base, los deploys, GitHub.»",
  "learned-agents": "Tres clicks, una frase cada uno. Honesto: lo difícil sigue siendo decidir.",
  takeaways: "Tres clicks, una frase cada uno.",
  join: "Dejá el QR unos segundos. «Es todo abierto, hagan su propio Owy.»",
  "to-qa": "Cue «Owy lee la más votada». Decidí en el momento quién contesta (botones en Preguntas).",
  qa: "Moderá desde Preguntas: fijar, respondida, ocultar, «Owy, respondé». El mic de mano va al público con «Owy escucha: Público». A los 5 min, cerrá.",
  end: "Gracias. Cue de despedida de Owy. Después, volvé al lobby (Inicio) si queda gente.",
};
