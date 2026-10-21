import { defineSchedule } from "eve/schedules";

/**
 * The Semanario's weekly draft: Mondays 12:00 UTC (09:00 in Montevideo). On the
 * Hobby plan Vercel may fire it up to an hour late, which is fine for a draft a
 * person reviews later. Runs as the app principal; the semanario tools accept it.
 */
export default defineSchedule({
  cron: "0 12 * * 1",
  markdown:
    "Es lunes: armá el borrador del Semanario OWU de esta semana siguiendo la skill `semanario` (cargala primero). Juntá todo con collect_semanario, escribí el título, la intro y un título de una línea por hilo, y guardalo con save_semanario_draft. No publiques nada: lo revisa y lo publica una persona del staff.",
});
