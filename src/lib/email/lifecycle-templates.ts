import type { Email } from "./send";
import { appUrl, button, esc, layout } from "./templates";

/** The day a task is due, to whoever took it: one line, the event, and where to tick it. */
export function taskDueEmail(input: {
  task: string;
  event: string;
  /** "jue 19 nov · 19:00" */
  when: string;
  community: string;
  /** The event's page in the panel */
  panelPath: string;
}): Omit<Email, "to"> {
  const link = appUrl(input.panelPath);
  const line = `Hoy toca «${input.task}» para ${input.event}.`;
  const detail = `Es el evento de ${input.community} del ${input.when}. Cuando esté, marcala como lista y el resto del equipo lo ve.`;

  return {
    subject: `Hoy toca: ${input.task}`,
    html: layout({
      preheader: line,
      body: `<p style="margin:0 0 16px"><strong>${esc(line)}</strong></p>
<p style="margin:0 0 16px">${esc(detail)}</p>
<p style="margin:0 0 8px">${button(link, "Ver las tareas")}</p>`,
    }),
    text: `${line}\n\n${detail}\n\nVer las tareas: ${link}`,
  };
}

/** A volunteer gets their job: what, when to be there, and thanks. */
export function volunteerRoleEmail(input: {
  name: string;
  role: string;
  /** "18:30" */
  at: string;
  event: string;
  /** "jue 19 nov" */
  day: string;
  community: string;
  pagePath: string;
}): Omit<Email, "to"> {
  const link = appUrl(input.pagePath);
  const line = `¡Gracias, ${input.name}! Te toca ${input.role.toLowerCase()} a las ${input.at}.`;
  const detail = `Es en ${input.event}, el ${input.day}. Si al final no podés, avisale a ${input.community} respondiendo este mail.`;

  return {
    subject: `Te toca ${input.role.toLowerCase()} en ${input.event}`,
    html: layout({
      preheader: line,
      body: `<p style="margin:0 0 16px"><strong>${esc(line)}</strong></p>
<p style="margin:0 0 16px">${esc(detail)}</p>
<p style="margin:0 0 8px">${button(link, "Ver el evento")}</p>`,
    }),
    text: `${line}\n\n${detail}\n\nVer el evento: ${link}`,
  };
}

/** After the event, to each volunteer who came. */
export function volunteerThanksEmail(input: {
  name: string;
  event: string;
  community: string;
  pagePath: string;
}): Omit<Email, "to"> {
  const link = appUrl(input.pagePath);
  const line = `¡Gracias por dar una mano en ${input.event}, ${input.name}!`;
  const detail = `Sin gente como vos, ${input.community} no se arma. Ojalá nos veamos en el próximo.`;

  return {
    subject: `Gracias por dar una mano en ${input.event}`,
    html: layout({
      preheader: line,
      body: `<p style="margin:0 0 16px"><strong>${esc(line)}</strong></p>
<p style="margin:0 0 16px">${esc(detail)}</p>
<p style="margin:0 0 8px">${button(link, "Ver el evento")}</p>`,
    }),
    text: `${line}\n\n${detail}\n\nVer el evento: ${link}`,
  };
}
