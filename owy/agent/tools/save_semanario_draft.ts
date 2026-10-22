import { defineTool } from "eve/tools";
import { z } from "zod";

import { owuApi, owuApiUrl } from "../lib/owu-api";
import { collectSemanarioInputs } from "../lib/semanario";
import { requireStaffOrSchedule, staffOrSchedule } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF O EL CRON DEL LUNES: guarda el borrador del Semanario OWU de esta semana en el sitio. Vos ponés el título, la intro y un título de una línea por hilo (por permalink, tal como vino de collect_semanario); los datos (hilos, respuestas, búsquedas, eventos) los vuelve a leer la tool, no se pueden inventar. Si la semana ya está publicada, no la toca. NUNCA publica: una persona del staff lo revisa y lo publica desde owu.uy/admin/semanario.",
  inputSchema: z.object({
    title: z.string().min(1).max(160).describe("Título del número: concreto, sin clickbait, sin emojis"),
    intro: z
      .string()
      .max(2000)
      .describe("Intro en Markdown: 2 o 3 párrafos cortos, en rioplatense, cálida, sin citar mensajes ni nombrar gente"),
    threads: z
      .array(
        z.object({
          permalink: z.string().describe("El permalink tal cual vino de collect_semanario"),
          title: z.string().min(1).max(200).describe("Tu título de una línea para el hilo, sin citarlo"),
        })
      )
      .max(10)
      .describe("Los hilos a incluir, en el orden en que deben aparecer"),
    includeJobs: z.boolean().default(true).describe("false para no mencionar las búsquedas de la semana"),
  }),
  label: { start: () => "Guardar el borrador del Semanario" },
  approval: staffOrSchedule(),
  async execute({ title, intro, threads, includeJobs }, ctx) {
    requireStaffOrSchedule(ctx);
    const inputs = await collectSemanarioInputs();
    const byPermalink = new Map(inputs.threads.map((thread) => [thread.permalink, thread]));

    // Only threads that really were nominated this week make it in, with their real counts
    const chosen = threads.flatMap(({ permalink, title: threadTitle }) => {
      const thread = byPermalink.get(permalink);

      return thread
        ? [{ channel: thread.channel, title: threadTitle, permalink: thread.permalink, replies: thread.replies }]
        : [];
    });

    const issue = await owuApi().semanario.saveDraft({
      weekStart: inputs.weekStart,
      title,
      intro,
      sections: {
        events: inputs.events,
        threads: chosen,
        jobs: includeJobs ? inputs.jobs : null,
        newCommunities: [],
      },
    });

    return {
      saved: true,
      weekStart: issue.weekStart,
      status: issue.status,
      threads: chosen.length,
      skippedThreads: threads.length - chosen.length,
      events: inputs.events.length,
      reviewAt: `${owuApiUrl()}/admin/semanario`,
    };
  },
});
