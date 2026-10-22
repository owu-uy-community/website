import { defineTool } from "eve/tools";
import { z } from "zod";

import { collectSemanarioInputs } from "../lib/semanario";
import { requireStaffOrSchedule, staffOrSchedule } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF O EL CRON DEL LUNES: junta lo que va en el Semanario OWU de esta semana. Devuelve los hilos de canales públicos que la comunidad marcó con la reacción de nominación (canal, permalink, respuestas, marcas y un extracto corto SOLO para que escribas un título propio de una línea; nunca lo cites), cuántas búsquedas nuevas hubo en el canal de trabajos y los eventos de la semana. No escribe nada.",
  inputSchema: z.object({}),
  label: { start: () => "Juntar lo de la semana para el Semanario" },
  approval: staffOrSchedule(),
  async execute(_input, ctx) {
    requireStaffOrSchedule(ctx);

    return collectSemanarioInputs();
  },
});
