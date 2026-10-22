import { defineTool } from "eve/tools";
import { z } from "zod";
import { owuApi } from "../lib/owu-api";

export default defineTool({
  description:
    "Vincula el Telegram de la persona con su cuenta de OWU, para que Owy sepa quién es (y qué puede hacer). Usala cuando alguien te mande '/vincular <código>' o '/start <código>' (el botón «Iniciar» del link de owu.uy) o te pase ese código de 8 letras y números: lo genera en owu.uy/acceso, dura 10 minutos. Solo funciona por Telegram.",
  inputSchema: z.object({
    code: z
      .string()
      .regex(/^[A-Za-z0-9]{8}$/)
      .describe("Las 8 letras y números del código que sacó en owu.uy/acceso"),
  }),
  async execute(input, ctx) {
    const auth = ctx.session?.auth?.current;
    const telegramUserId = auth?.attributes?.user_id;
    if (auth?.authenticator !== "telegram-webhook" || !telegramUserId) {
      return { ok: false, error: "Esto se hace desde Telegram: mandame /vincular <código> por mensaje privado." };
    }
    // Owy itself links it (its key may): the code proves who made it on the site
    const { name } = await owuApi().access.telegram.link({
      code: input.code.trim(),
      telegramUserId: String(telegramUserId),
    });

    return { ok: true, linked: name };
  },
});
