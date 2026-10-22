import { SITE_URL } from "../community/site";
import type { Email } from "./send";

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for HTML: every value from a person or the database goes through this. */
export const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);

/**
 * The one layout every OWU email shares: plain, light, readable in any client. `body` is trusted
 * HTML built with `esc`; `preheader` is the inbox preview line.
 */
export function layout({ preheader, body }: { preheader: string; body: string }) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#f4f4f5;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border-top:4px solid #F5BB03">
<tr><td style="padding:28px 28px 8px;font-size:13px;font-weight:700;letter-spacing:.08em;color:#71717a">OWU · COMUNIDAD TI DE URUGUAY</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6">${body}</td></tr>
</table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#71717a">Te escribimos desde <a href="https://owu.uy" style="color:#71717a">owu.uy</a>.</p>
</td></tr></table>
</body></html>`;
}

/** The sign-in code. The code leads the subject so it shows in the notification. */
export function otpEmail(code: string): Omit<Email, "to"> {
  return {
    subject: `${code} es tu código para entrar a OWU`,
    html: layout({
      preheader: `Tu código es ${code}. Vence en 10 minutos.`,
      body: `<p style="margin:0 0 16px">Usá este código para entrar a OWU:</p>
<p style="margin:0 0 16px;font-family:'Geist Mono',ui-monospace,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:.2em">${esc(code)}</p>
<p style="margin:0;color:#52525b">Vence en 10 minutos. Si no lo pediste, ignorá este mail: nadie entra sin el código.</p>`,
    }),
    text: `Tu código para entrar a OWU es ${code}.\n\nVence en 10 minutos. Si no lo pediste, ignorá este mail: nadie entra sin el código.`,
  };
}

/** A link into this deployment (owu.uy in production, the preview's own URL elsewhere). */
export const appUrl = (path: string) => new URL(path, process.env.NEXT_PUBLIC_BASE_URL ?? SITE_URL).toString();

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#F5BB03;color:#18181b;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px">${esc(label)}</a>`;

const ROLE = { owner: "dueño/a", admin: "admin", editor: "editor/a", member: "miembro" } as const;

/** Staff answered someone's request to organize a community. */
export function claimDecidedEmail(input: {
  name: string;
  communityName: string;
  communitySlug: string;
  role: keyof typeof ROLE | null;
}): Omit<Email, "to"> {
  const hi = input.name ? `Hola ${input.name.split(" ")[0]},` : "Hola,";
  if (input.role) {
    const panel = appUrl(`/organizar/panel/${input.communitySlug}`);

    return {
      subject: `Ya organizás ${input.communityName} en OWU`,
      html: layout({
        preheader: `Tu panel de ${input.communityName} está listo.`,
        body: `<p style="margin:0 0 16px">${esc(hi)}</p>
<p style="margin:0 0 16px">El staff de OWU confirmó que organizás <strong>${esc(input.communityName)}</strong>. Entrás como ${ROLE[input.role]}: ya podés ver el calendario de todas las comunidades, reservar fecha y armar tus eventos.</p>
<p style="margin:0 0 8px">${button(panel, "Abrir el panel")}</p>`,
      }),
      text: `${hi}\n\nEl staff de OWU confirmó que organizás ${input.communityName}. Entrás como ${ROLE[input.role]}.\n\nAbrí el panel: ${panel}`,
    };
  }

  return {
    subject: `Tu pedido para organizar ${input.communityName}`,
    html: layout({
      preheader: "El staff de OWU no pudo confirmarlo todavía.",
      body: `<p style="margin:0 0 16px">${esc(hi)}</p>
<p style="margin:0 0 16px">El staff de OWU no pudo confirmar que organizás <strong>${esc(input.communityName)}</strong>. Si es un error, escribinos en el Slack de OWU o mandá el pedido de nuevo con un link que lo muestre.</p>`,
    }),
    text: `${hi}\n\nEl staff de OWU no pudo confirmar que organizás ${input.communityName}. Si es un error, escribinos en el Slack de OWU o mandá el pedido de nuevo con un link que lo muestre.`,
  };
}

/** Another community with a similar audience took a date the same day as something of yours. */
export function conflictHeadsUpEmail(input: {
  community: string;
  when: string;
  /** Your event's name; null when what you have that day is a hold */
  theirs: string | null;
  calendarPath: string;
}): Omit<Email, "to"> {
  const yours = input.theirs ? `tu evento «${input.theirs}»` : "tu fecha reservada";
  const link = appUrl(input.calendarPath);
  const line = `${input.community} reservó el ${input.when}, el mismo día que ${yours}. Tienen un público parecido.`;

  return {
    subject: `${input.community} eligió el mismo día que vos`,
    html: layout({
      preheader: line,
      body: `<p style="margin:0 0 16px">${esc(line)}</p>
<p style="margin:0 0 16px">Todavía están a tiempo de acomodarse: mirá el calendario y, si hace falta, coordinen en #organizadores-meetups.</p>
<p style="margin:0 0 8px">${button(link, "Ver el calendario")}</p>`,
    }),
    text: `${line}\n\nTodavía están a tiempo de acomodarse: mirá el calendario y, si hace falta, coordinen en #organizadores-meetups.\n\n${link}`,
  };
}

/** A reserved date is about to be released. */
export function holdExpiringEmail(input: {
  community: string;
  title: string;
  when: string;
  until: string;
  panelPath: string;
}): Omit<Email, "to"> {
  const link = appUrl(input.panelPath);
  const line = `La reserva del ${input.when} («${input.title}», ${input.community}) vence el ${input.until}.`;

  return {
    subject: `Tu reserva del ${input.when} vence pronto`,
    html: layout({
      preheader: line,
      body: `<p style="margin:0 0 16px">${esc(line)}</p>
<p style="margin:0 0 16px">Si la seguís queriendo, renovala desde el panel; si no, se libera sola y otras comunidades pueden usar el día.</p>
<p style="margin:0 0 8px">${button(link, "Renovar la reserva")}</p>`,
    }),
    text: `${line}\n\nSi la seguís queriendo, renovala desde el panel; si no, se libera sola.\n\n${link}`,
  };
}

/** A community asks a space to host (to its consented contacts). */
export function venueRequestEmail(input: {
  venue: string;
  community: string;
  organizer: string;
  options: string[];
  expectedAttendees: number;
  message: string;
  until: string;
  link: string;
}): Omit<Email, "to"> {
  const who = input.organizer ? `${input.organizer}, de ${input.community},` : input.community;
  const dates = input.options.map((option, index) => `${index + 1}. ${option}`);

  return {
    subject: `${input.community} quiere hacer su meetup en ${input.venue}`,
    html: layout({
      preheader: `Para unas ${input.expectedAttendees} personas. Respondé antes del ${input.until}.`,
      body: `<p style="margin:0 0 16px">${esc(who)} pregunta si pueden hacer su meetup en ${esc(input.venue)}, para unas <strong>${input.expectedAttendees} personas</strong>. Estas fechas, en orden de preferencia:</p>
<p style="margin:0 0 16px;font-family:'Geist Mono',ui-monospace,Menlo,monospace">${dates.map(esc).join("<br>")}</p>
${input.message ? `<p style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:8px">«${esc(input.message)}»</p>` : ""}
<p style="margin:0 0 16px">Respondé desde el link, sin crear cuenta: podés elegir una fecha, proponer otra o decir que esta vez no. Tu mail les llega solo si aceptás.</p>
<p style="margin:0 0 8px">${button(input.link, "Ver el pedido")}</p>
<p style="margin:16px 0 0;color:#71717a;font-size:13px">El pedido vence el ${esc(input.until)}.</p>`,
    }),
    text: `${who} pregunta si pueden hacer su meetup en ${input.venue}, para unas ${input.expectedAttendees} personas.\n\n${dates.join("\n")}\n${input.message ? `\n«${input.message}»\n` : ""}\nRespondé desde el link (vence el ${input.until}): ${input.link}`,
  };
}

/** The host answered, or nobody did in time (to the organizer who asked). */
export function venueResponseEmail(input: {
  venue: string;
  outcome: "accepted" | "declined" | "expired";
  when: string | null;
  address: string | null;
  hostMessage: string | null;
  contact: { name: string; email: string } | null;
  panelPath: string;
}): Omit<Email, "to"> {
  const link = appUrl(input.panelPath);
  const note = input.hostMessage
    ? `<p style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:8px">«${esc(input.hostMessage)}»</p>`
    : "";
  if (input.outcome === "accepted") {
    const lines = [
      `${input.venue} los recibe el ${input.when}.`,
      input.address ? `Dirección: ${input.address}.` : "",
      input.contact ? `Contacto: ${input.contact.name} (${input.contact.email}).` : "",
    ].filter(Boolean);

    return {
      subject: `${input.venue} los recibe el ${input.when}`,
      html: layout({
        preheader: lines[0] ?? "",
        body: `${lines.map((line) => `<p style="margin:0 0 12px">${esc(line)}</p>`).join("")}${note}
<p style="margin:0 0 8px">${button(link, "Ver en el panel")}</p>`,
      }),
      text: `${lines.join("\n")}${input.hostMessage ? `\n\n«${input.hostMessage}»` : ""}\n\n${link}`,
    };
  }
  const line =
    input.outcome === "declined"
      ? `${input.venue} no puede recibirlos en esas fechas.`
      : `${input.venue} no respondió a tiempo: el pedido venció.`;

  return {
    subject: input.outcome === "declined" ? `${input.venue} no puede esta vez` : `Tu pedido a ${input.venue} venció`,
    html: layout({
      preheader: line,
      body: `<p style="margin:0 0 16px">${esc(line)}</p>${note}
<p style="margin:0 0 16px">Probá con otro espacio desde el panel.</p>
<p style="margin:0 0 8px">${button(link, "Buscar otro espacio")}</p>`,
    }),
    text: `${line}${input.hostMessage ? `\n\n«${input.hostMessage}»` : ""}\n\nProbá con otro espacio: ${link}`,
  };
}

/** The host accepted: now they get the organizer's contact. */
export function venueAnsweredHostEmail(input: {
  venue: string;
  community: string;
  when: string;
  organizer: { name: string; email: string };
}): Omit<Email, "to"> {
  const line = `Confirmaste que ${input.venue} recibe a ${input.community} el ${input.when}. ¡Gracias!`;
  const contact = `Quien organiza: ${input.organizer.name} (${input.organizer.email}). Coordinen los detalles directo.`;

  return {
    subject: `Confirmado: ${input.community} en ${input.venue} el ${input.when}`,
    html: layout({
      preheader: line,
      body: `<p style="margin:0 0 12px">${esc(line)}</p><p style="margin:0 0 12px">${esc(contact)}</p>`,
    }),
    text: `${line}\n\n${contact}`,
  };
}

export type RsvpEmailKind =
  | "confirmed"
  | "waitlisted"
  | "offered"
  | "pending"
  | "promoted"
  | "declined"
  | "offer_expired"
  | "left";

/** One RSVP email: what happened, what the event is, and the link that does the next thing. */
export function rsvpEmail(input: {
  kind: RsvpEmailKind;
  name: string;
  event: string;
  community: string;
  when: string;
  place: string;
  /** Only for people with a seat */
  onlineUrl: string | null;
  ticketUrl: string;
  qrUrl: string | null;
  pageUrl: string;
  position?: number | null;
  offerUntil?: string | null;
}): Omit<Email, "to"> {
  const hi = input.name ? `Hola ${input.name.split(" ")[0]},` : "Hola,";
  const facts = `${input.when} · ${input.place}`;
  const copy: Record<RsvpEmailKind, { subject: string; lead: string; action?: [string, string] }> = {
    confirmed: {
      subject: `Estás anotado: ${input.event}`,
      lead: `Tenés lugar en ${input.event}, de ${input.community}. Te esperamos.`,
      action: ["Ver mi entrada", input.ticketUrl],
    },
    promoted: {
      subject: `Se liberó un lugar: ya estás en ${input.event}`,
      lead: `Alguien liberó su lugar y ahora es tuyo. Si al final no podés ir, liberalo desde tu entrada así lo aprovecha otra persona.`,
      action: ["Ver mi entrada", input.ticketUrl],
    },
    waitlisted: {
      subject: `Estás en la lista de espera: ${input.event}`,
      lead: `El cupo está lleno, así que quedaste en la lista de espera${input.position ? ` (puesto ${input.position})` : ""}. Si se libera un lugar te escribimos.`,
      action: ["Ver mi lugar en la lista", input.ticketUrl],
    },
    offered: {
      subject: `Se liberó un lugar en ${input.event}: confirmá antes del ${input.offerUntil}`,
      lead: `Se liberó un lugar y es para vos. Confirmalo antes del ${input.offerUntil}; si no, pasa a la siguiente persona.`,
      action: ["Confirmar mi lugar", input.ticketUrl],
    },
    pending: {
      subject: `Recibimos tu inscripción: ${input.event}`,
      lead: `${input.community} revisa las inscripciones a mano. Te avisamos cuando te confirmen.`,
    },
    declined: {
      subject: `Tu inscripción a ${input.event}`,
      lead: `Esta vez ${input.community} no pudo confirmarte un lugar. Gracias por el interés.`,
    },
    offer_expired: {
      subject: `Se venció el lugar que te ofrecimos: ${input.event}`,
      lead: `No confirmaste a tiempo y el lugar pasó a la siguiente persona. Si querés, podés volver a anotarte.`,
      action: ["Ver el evento", input.pageUrl],
    },
    left: {
      subject: `Liberaste tu lugar: ${input.event}`,
      lead: `Listo, liberaste tu lugar. ¡Gracias por avisar! Si cambiás de idea, podés volver a anotarte.`,
      action: ["Ver el evento", input.pageUrl],
    },
  };
  const { subject, lead, action } = copy[input.kind];
  const seat = input.kind === "confirmed" || input.kind === "promoted";
  const extra = [
    seat && input.onlineUrl ? `Link para conectarte: ${input.onlineUrl}` : "",
    seat ? "Si no podés ir, liberá tu lugar desde la entrada: alguien de la lista de espera lo aprovecha." : "",
  ].filter(Boolean);

  return {
    subject,
    html: layout({
      preheader: lead,
      body: `<p style="margin:0 0 16px">${esc(hi)}</p>
<p style="margin:0 0 16px">${esc(lead)}</p>
<p style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:8px"><strong>${esc(input.event)}</strong><br>${esc(facts)}</p>
${seat && input.qrUrl ? `<p style="margin:0 0 16px;text-align:center"><img alt="Código QR de tu entrada" height="180" src="${esc(input.qrUrl)}" style="border-radius:8px" width="180"></p>` : ""}
${extra.map((line) => `<p style="margin:0 0 12px;color:#52525b">${esc(line)}</p>`).join("")}
${action ? `<p style="margin:8px 0 0">${button(action[1], action[0])}</p>` : ""}`,
    }),
    text: [hi, lead, `${input.event}\n${facts}`, ...extra, action ? `${action[0]}: ${action[1]}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  };
}
