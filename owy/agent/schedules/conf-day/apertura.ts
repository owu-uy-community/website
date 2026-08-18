import { defineSchedule } from "eve/schedules";
import { announceToAll } from "../../lib/announce";

const PROMPT = `Arranca la OWU Conf: son las 14:30 del día del evento y abren las puertas.
Redactá UN mensaje de apertura para el canal (tono Owy, corto, con energía):
- dales la bienvenida a Sinergia Faro,
- recordá que la jornada arranca con la bienvenida y el mercado de ideas del open space (cualquiera puede proponer tema),
- avisá que te pueden preguntar a vos (Owy) por la grilla, horarios y dudas del evento durante todo el día.
No uses datos que no tengas; no hace falta llamar tools para este mensaje.`;

export default defineSchedule({
  // 17:30 UTC = 14:30 America/Montevideo (UTC-3, sin DST). Corre cada 7 de
  // noviembre; announceToAll() además exige que sea OWY_CONF_DATE.
  cron: "30 17 7 11 *",
  run(args) {
    announceToAll(args, PROMPT);
  },
});
