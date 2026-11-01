/**
 * Presenter notes for «Owy, en vivo», by slide id: only the console imports this, so it stays
 * out of the public stage bundle. Stage directions, what to say, and what to do if it breaks.
 */
export const TALK_NOTES: Record<string, string> = {
  lobby:
    "Puertas abiertas. Owy conectado y la perilla en la mano. A T-1:00, cue «Aviso». Mirá que entren preguntas en el panel.",
  wake: "Luces. No digas nada: Owy arranca solo (cue auto). Cuando te pregunta «¿Arrancás, Agus?», entrás con el mic.",
  title:
    "Presentate y presentalo. «Hoy la charla la damos entre los dos». Contá que pueden preguntar desde el celular en cualquier momento.",
  questions: "Avanzá burbuja por burbuja. Contá una anécdota real de una conf pasada.",
  board: "Primero la grilla de papel, después «alguien la pasa a mano». Ese alguien eras vos.",
  why: "[A] Tu frase, en primera persona. Pausa.",
  "poll-bathroom": "Dejá votar ~15 s. Next revela el resultado. Después, cue «Remate».",
  bodies: "Un cuerpo por click. Remarcá: el cerebro es uno solo, los cuerpos son muchos.",
  does: "Rápido: una frase por tile. El modo pitch se ve en vivo más adelante.",
  "demo-now":
    "Tocá la perilla y preguntá en voz alta. Owy tarda ~3 s en pensar: llenalo («está mirando la grilla de verdad»). Si la voz falla: cue por texto.",
  timeline: "Un hito por click. Contá el del 4 de septiembre: la primera vez que habló.",
  bugs: "Después del primero, cue «Chiste del micrófono». El de caffeinate siempre arranca una risa.",
  numbers: "Leé dos o tres números, no todos. Cue de la esquina al final.",
  inside: "Una caja por click, de izquierda a derecha. Quedate en el bridge: «se hace pasar por Home Assistant».",
  "inside-live":
    "Cue «Owy explica el diagrama» (o tocá la perilla y pedíselo). Mientras habla, las cajas se prenden solas. Comentá los tiempos del chip al terminar.",
  ladder: "Un escalón por click. Cue de los planes B al final.",
  decisions: "Tres clicks. La tercera es la importante: nunca inventar.",
  limits: "Opcional: si vas atrasado, saltala.",
  devices: "Levantá las placas cuando aparecen. La pantallita queda en la mesa mostrando la cara.",
  faces: "Cue «Owy presenta sus caras». La pantalla pasa sola por las expresiones.",
  pitch:
    "Modo pitch ON en la consola. Dale el micrófono de mano (TX2) y la perilla a la persona voluntaria, pasá «Owy escucha» a Público. Al terminar, modo pitch OFF y escucha de vuelta a Agustín.",
  vs: "Por cada ronda: dejá votar ~10 s, Next revela. Cue de revelación según quién lo escribió. [A] Antes de la charla: las de Owy tienen que salir de Owy y las tuyas de vos.",
  learned: "Tres clicks, una frase cada una.",
  join: "Dejá el QR unos segundos. «Es todo abierto, hagan su propio Owy».",
  "to-qa": "Cue «Owy lee la más votada». Decidí en el momento quién contesta (botones en Preguntas).",
  qa: "Moderá desde Preguntas: fijar, respondida, ocultar, «Owy, respondé». El mic de mano va al público con «Owy escucha: Público». Cada ~6 min un respiro: cue de levantar la mano, reacciones o una pregunta rápida.",
  rating: "Dejá puntuar. Cue de despedida de Owy.",
  photo: "Next arranca la cuenta regresiva. Sacá la selfie con la sala y la cara de Owy atrás. Confetti con C.",
  end: "Gracias. Después, volvé al lobby (Inicio) si queda gente.",
};
