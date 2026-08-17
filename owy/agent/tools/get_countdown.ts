import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveActiveEvent } from "../lib/board";
import { owuApi } from "../lib/owu-api";

export default defineTool({
  description:
    "Lee el estado del countdown/timer del open space (el que se muestra en pantalla): si está corriendo, segundos restantes y hora objetivo.",
  inputSchema: z.object({}),
  async execute() {
    const event = await resolveActiveEvent();
    return owuApi().countdown.getState({ eventId: event.id });
  },
});
