import type { OutreachReason } from "../db/schema";
import type { Email } from "./send";
import { button, esc, layout } from "./templates";

/**
 * Emails about a community's health and its people: the staff's outreach, the followers' weekly
 * digest, and code-of-conduct reports. Same layout and escaping as templates.ts.
 */

const paragraph = (text: string, style = "") =>
  `<p style="margin:0 0 14px${style ? `;${style}` : ""}">${esc(text)}</p>`;

const OUTREACH: Record<OutreachReason, (community: string) => { subject: string; lines: string[]; cta: string }> = {
  "en-riesgo": (community) => ({
    subject: `¿Cómo viene ${community}?`,
    lines: [
      "Vimos que hace un tiempo del último evento y no hay nada en agenda. ¿Les damos una mano?",
      "Algo liviano también suma: una charla relámpago, un after, repetir el último formato. Desde el panel reservás una fecha en un minuto, y si necesitan espacio o charla, avisanos.",
      "Si están en pausa a propósito, contanos hasta cuándo y lo mostramos así en el perfil.",
    ],
    cta: "Abrir el calendario",
  }),
  dormida: (community) => ({
    subject: `¿Siguen con ${community}?`,
    lines: [
      "Hace más de seis meses que no hay eventos. Pasa, y tiene arreglo: muchas comunidades vuelven con un evento chico y alguien nuevo en el equipo.",
      "Si quieren retomar, les ayudamos con la fecha, el espacio y la difusión. Si prefieren pasarla a otras manos, marcamos que busca organizadores.",
    ],
    cta: "Abrir el panel",
  }),
  "un-organizador": (community) => ({
    subject: `Sumemos a alguien más a ${community}`,
    lines: [
      "En los últimos 90 días, el panel lo usó una sola persona del equipo (o nadie). Si esa persona no puede un mes, la comunidad se frena.",
      "Sumá a alguien desde Equipo, aunque sea para dar una mano en la puerta: con dos que se turnan, la agenda sigue.",
    ],
    cta: "Ir a Equipo",
  }),
  "contacto-viejo": (community) => ({
    subject: `¿Siguen pudiendo recibir a ${community}?`,
    lines: [
      "El contacto de un espacio que usan no se confirmó hace tiempo, o los mails le rebotan.",
      "Si saben quién recibe meetups ahí ahora, respondé este mail y lo actualizamos.",
    ],
    cta: "Ver espacios",
  }),
  "pedido-sin-respuesta": () => ({
    subject: "Tu pedido de espacio sigue sin respuesta",
    lines: [
      "Un pedido de espacio lleva más de 72 horas sin respuesta. Puede que el contacto esté de licencia o ya no esté.",
      "Respondé este mail y les ayudamos a buscar otro lugar, o pedile a otro espacio desde el panel.",
    ],
    cta: "Ver espacios",
  }),
};

const OUTREACH_PATH: Record<OutreachReason, string> = {
  "en-riesgo": "calendario",
  dormida: "",
  "un-organizador": "equipo",
  "contacto-viejo": "espacios",
  "pedido-sin-respuesta": "espacios",
};

/** OWU's staff writing to a community's organizers because it needs a hand. Replies go to the staff. */
export function outreachEmail(input: {
  community: string;
  reason: OutreachReason;
  /** What the queue saw, in one line ("Hace 74 días del último evento, y nada en agenda") */
  why: string;
  staffName: string;
  /** The community's panel; the button opens the page that fixes it */
  panelUrl: string;
}): Omit<Email, "to"> {
  const { subject, lines, cta } = OUTREACH[input.reason](input.community);
  const path = OUTREACH_PATH[input.reason];
  const url = path ? `${input.panelUrl}/${path}` : input.panelUrl;

  return {
    subject,
    html: layout({
      preheader: lines[0],
      body: `${paragraph(`Hola, equipo de ${input.community}:`)}${lines.map((line) => paragraph(line)).join("")}
<p style="margin:0 0 20px;color:#71717a;font-size:13px">${esc(input.why)}.</p>
<p style="margin:0 0 20px">${button(url, cta)}</p>
<p style="margin:0;color:#52525b">${esc(input.staffName)}, del equipo de OWU. Respondé este mail para hablar.</p>`,
    }),
    text: `Hola, equipo de ${input.community}:\n\n${lines.join("\n\n")}\n\n${input.why}.\n\n${cta}: ${url}\n\n${input.staffName}, del equipo de OWU. Respondé este mail para hablar.`,
  };
}

export type DigestEvent = { community: string; name: string; when: string; place: string; url: string };

/** A follower's weekly digest: what the communities they follow publish in the next two weeks. */
export function followerDigestEmail(input: {
  events: DigestEvent[];
  /** A few more from the rest of OWU */
  others: DigestEvent[];
  unsubscribeUrl: string;
  /** Where to switch back to an email per event, or stop following */
  manageUrl: string;
}): Omit<Email, "to"> {
  const item = (event: DigestEvent) =>
    `<li style="margin:0 0 14px"><a href="${esc(event.url)}" style="color:#18181b;font-weight:600">${esc(event.name)}</a><br><span style="color:#52525b;font-size:14px">${esc(event.community)} · ${esc(event.when)} · ${esc(event.place)}</span></li>`;
  const line = (event: DigestEvent) =>
    `- ${event.name} (${event.community}) · ${event.when} · ${event.place}: ${event.url}`;
  const count = input.events.length;

  return {
    subject:
      count === 1
        ? `Esta semana en OWU: ${input.events[0].name}`
        : `Esta semana en OWU: ${count} eventos de las comunidades que seguís`,
    html: layout({
      preheader: input.events.map((event) => event.name).join(" · "),
      body: `<p style="margin:0 0 16px">Lo que viene en las próximas dos semanas de las comunidades que seguís:</p>
<ul style="margin:0 0 8px;padding-left:18px">${input.events.map(item).join("")}</ul>
${
  input.others.length > 0
    ? `<p style="margin:16px 0 8px;color:#71717a;font-size:13px">Y en OWU</p><ul style="margin:0 0 8px;padding-left:18px">${input.others.map(item).join("")}</ul>`
    : ""
}<p style="margin:24px 0 0;color:#71717a;font-size:12px">Te llega los lunes porque elegiste un resumen por semana. <a href="${esc(input.manageUrl)}" style="color:#71717a">Cambiarlo</a> · <a href="${esc(input.unsubscribeUrl)}" style="color:#71717a">No recibir más avisos</a></p>`,
    }),
    text: `Lo que viene en las próximas dos semanas de las comunidades que seguís:\n\n${input.events.map(line).join("\n")}${
      input.others.length > 0 ? `\n\nY en OWU:\n${input.others.map(line).join("\n")}` : ""
    }\n\nTe llega los lunes porque elegiste un resumen por semana. Cambiarlo: ${input.manageUrl}\nNo recibir más avisos: ${input.unsubscribeUrl}`,
  };
}

/**
 * A code-of-conduct report from an event's page, to its responders and to OWU's conduct team.
 * `forOwu` adds what only OWU needs to know (it names someone on the team).
 */
export function conductReportEmail(input: {
  event: string;
  community: string;
  description: string;
  where: string | null;
  contact: string | null;
  involvesOrganizer: boolean;
  /** Where the report and its notes live (the event's Conducta page) */
  panelUrl: string;
  forOwu: boolean;
}): Omit<Email, "to"> {
  const facts = [
    input.where ? `Dónde o cuándo: ${input.where}` : null,
    input.contact ? `Contacto de quien reporta: ${input.contact}` : "Sin contacto: lo mandaron de forma anónima.",
    input.forOwu && input.involvesOrganizer
      ? "Involucra a alguien de la organización: no se lo mandamos a nadie del equipo y nadie del equipo lo puede leer."
      : null,
  ].filter((fact) => fact !== null);
  const deadline = "Respondé en medio día si el evento está en curso, o en 7 días si ya pasó.";

  return {
    subject: `Reporte de conducta: ${input.event}`,
    html: layout({
      preheader: `${input.community}. ${deadline}`,
      body: `<p style="margin:0 0 6px;color:#71717a;font-size:13px">${esc(input.community)} · ${esc(input.event)}</p>
<p style="margin:0 0 16px;font-size:18px;font-weight:700">Llegó un reporte de conducta</p>
<blockquote style="margin:0 0 16px;padding:0 0 0 12px;border-left:3px solid #F5BB03;white-space:pre-line">${esc(input.description)}</blockquote>
${facts.map((fact) => paragraph(fact, "color:#52525b")).join("")}
${paragraph(deadline)}
<p style="margin:0 0 20px">${button(input.panelUrl, "Ver el reporte y anotar")}</p>
<p style="margin:0;color:#71717a;font-size:12px">Es confidencial: no lo reenvíes. Lo leen solo quienes responden por la conducta del evento y el equipo de conducta de OWU.</p>`,
    }),
    text: `Llegó un reporte de conducta en ${input.event} (${input.community}):\n\n${input.description}\n\n${facts.join("\n")}\n\n${deadline}\n\nVer el reporte y anotar: ${input.panelUrl}\n\nEs confidencial: no lo reenvíes.`,
  };
}
