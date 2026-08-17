import { defineSchedule } from "eve/schedules";
import { announceToAll } from "../../lib/announce";

const PROMPT = `Estamos en pleno open space de la OWU Conf. Mirá la hora actual (Uruguay, UTC-3) y consultá la grilla en vivo con get_agenda y get_openspace_board.
- Si un bloque del open space está por empezar (o acaba de empezar), mandá UN mensaje corto anunciándolo: horario del bloque y qué charlas hay en qué salas (título + sala, sin descripciones largas).
- Si estamos en un corte, podés anunciar el coffee break y qué viene después.
- Si no hay nada nuevo que anunciar desde el bloque anterior (o el open space no está activo), terminá SIN mandar nada al canal.`;

export default defineSchedule({
  // Cada 30 min entre 18:00 y 22:30 UTC = 15:00–19:30 en Uruguay, el 7/11.
  cron: "0,30 18-22 7 11 *",
  run(args) {
    announceToAll(args, PROMPT);
  },
});
