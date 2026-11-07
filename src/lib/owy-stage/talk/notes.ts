/**
 * Presenter notes for «Owy, en vivo», by slide id: only the console imports this, so it stays
 * out of the public stage bundle. Stage directions, what to say, and what to do if it breaks.
 */
export const TALK_NOTES: Record<string, string> = {
  lobby:
    "Antes de abrir puertas: en la mesa, el evento del wall = la grilla demo (la misma que COMPANION_PITCH_EVENT_ID), con lugares libres. Owy conectado y la perilla en la mano. A T-1:00, cue «Aviso».",
  wake: "Luces. No digas nada: Owy arranca solo (cue auto). Cuando te pregunta «¿Arrancás, Agus?», entrás con el mic.",
  title:
    "Presentate y presentalo. «Hoy les contamos cómo funciona el open space por dentro y qué hace Owy ahí». Pueden preguntar desde el celular en cualquier momento.",
  paper: "Primero la grilla de papel, después «alguien la pasa a mano». Ese alguien eras vos.",
  grid: "Es la grilla de verdad, en vivo. Contá: salas por bloques; el staff la maneja desde el celular (arrastrar, editar, deshacer); la misma la ve la gente en conf.owu.uy/openspace, los kiosks y el wall.",
  ai: "Tres clicks. En «Sugerir con AI» remarcá: el modelo no elige la celda, contesta sí o no a preguntas chicas y el lugar sale de una cuenta. Medio segundo.",
  "poll-bathroom": "Dejá votar ~15 s. Next revela el resultado. Después, cue «Remate». Es el puente a Owy.",
  bodies:
    "Un cuerpo por click. El cerebro es uno solo; los cuerpos, muchos. La perilla ahora es sólo cara y botón (más adelante, por qué).",
  "demo-now":
    "Tocá la perilla y preguntá en voz alta. Owy tarda ~3 s: llenalo («está mirando la grilla de verdad»). Si la voz falla: cue por texto.",
  tools:
    "Una fila por click. Volvé a la demo: «¿cómo supo? Con estas tools». Remarcá que son los mismos archivos para Slack, Telegram y la voz, y que Owy hace sólo lo que vos podés hacer.",
  hub: "Click 1 quién escribe, 2 el centro, 3 quién escucha: ahí arranca el pulso. Si querés, mové una tarjeta de la grilla demo desde el celular: el bus se prende de verdad.",
  wifi: "Primero el router (anda), después la perilla. Dejá que se vean los paquetes perdidos antes de hablar.",
  "wifi-bugs":
    "Uno por click. Después del primero, cue «Chiste del silencio». El del USB 3 es probable, no probado: decilo así.",
  split:
    "Click: «Antes», después «Ahora». La frase: «por el wifi, mensajes; el audio, cerca». El DJI y la PA están en la Mac.",
  deleted: "Leé dos números: 19 mil borradas y 0 audio por el wifi. Cue de los oídos al final.",
  inside:
    "Una caja por click. Con todas a la vista, cue «Owy explica el diagrama» (o tocá la perilla y pedíselo): las cajas se prenden solas y abajo quedan los tiempos.",
  ladder: "Un escalón por click. Cue de los planes B al final.",
  "pitch-flow":
    "Una estación por click. Es el mapa de la demo que sigue: «todo esto pasa en unos segundos». Mientras, modo Pitch ON en la consola.",
  pitch:
    "Modo pitch ON y «Owy escucha a» Público. Dale el mic de mano (TX2) y la perilla a la persona voluntaria. Cue «Owy invita» si hace falta. La tarjeta aparece sola en la grilla (anillo amarillo) y en la perilla. Al terminar, modo pitch OFF y escucha de vuelta a Agustín. Si la grilla está llena, Owy lo dice: borrá una tarjeta demo.",
  learned: "Tres clicks, una frase cada una.",
  join: "Dejá el QR unos segundos. «Es todo abierto, hagan su propio Owy».",
  "to-qa": "Cue «Owy lee la más votada». Decidí en el momento quién contesta (botones en Preguntas).",
  qa: "Moderá desde Preguntas: fijar, respondida, ocultar, «Owy, respondé». El mic de mano va al público con «Owy escucha: Público». A los 5 min, cerrá.",
  end: "Gracias. Cue de despedida de Owy. Después, volvé al lobby (Inicio) si queda gente.",
};
