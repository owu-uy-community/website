import { defineSchedule } from "eve/schedules";
import { announceToAll } from "../../lib/announce";

const PROMPT = `La OWU Conf está llegando al cierre (son ~20:15 en Uruguay).
Redactá UN mensaje de despedida para el canal (tono Owy, corto y cálido):
- agradecé a asistentes, speakers, staff y sponsors,
- invitá al after y a la foto grupal del cierre,
- recordá que la comunidad sigue todo el año en el Slack de OWU (https://slack.owu.uy) y en las redes (@owu__uy).
No uses datos que no tengas; no hace falta llamar tools para este mensaje.`;

export default defineSchedule({
  // 23:15 UTC = 20:15 America/Montevideo, el 7/11.
  cron: "15 23 7 11 *",
  run(args) {
    announceToAll(args, PROMPT);
  },
});
