import type { Email } from "./send";
import { appUrl, button, esc, layout } from "./templates";

/** The community's usual day is coming and nothing is planned for it: build it, give it up or go light. */
export function emptySlotEmail(input: {
  community: string;
  /** "jueves 12/11" */
  day: string;
  /** The calendar on that day, with the hold form open */
  calendarPath: string;
}): Omit<Email, "to"> {
  const link = appUrl(input.calendarPath);
  const line = `Tu ${input.day} no tiene evento: ¿lo armamos, lo cedemos o hacemos algo liviano?`;
  const detail = `Es el día de siempre de ${input.community}. Si lo reservás ahora, las otras comunidades lo ven y lo evitan; si este mes no da, dejalo libre para que lo use otra.`;
  const light = "Algo liviano también vale: una charla corta, una juntada o una sesión de preguntas.";

  return {
    subject: `Tu ${input.day} no tiene evento todavía`,
    html: layout({
      preheader: line,
      body: `<p style="margin:0 0 16px"><strong>${esc(line)}</strong></p>
<p style="margin:0 0 16px">${esc(detail)}</p>
<p style="margin:0 0 16px">${esc(light)}</p>
<p style="margin:0 0 8px">${button(link, "Reservar el día")}</p>`,
    }),
    text: `${line}\n\n${detail}\n\n${light}\n\nReservar el día: ${link}`,
  };
}
