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

const ROLE: Record<string, string> = {
  owner: "dueño/a",
  admin: "admin",
  editor: "editor/a",
  member: "miembro",
  door: "puerta",
  staff: "staff de OWU",
  moderator: "moderación de OWU",
  superadmin: "superadmin",
};
const roleLabel = (role: string) =>
  role
    .split(",")
    .map((name) => ROLE[name] ?? name)
    .join(" y ");

/** Staff answered someone's request to organize a community. */
export function claimDecidedEmail(input: {
  name: string;
  communityName: string;
  communitySlug: string;
  role: string | null;
}): Omit<Email, "to"> {
  const hi = input.name ? `Hola ${input.name.split(" ")[0]},` : "Hola,";
  if (input.role) {
    const panel = appUrl(`/organizar/panel/${input.communitySlug}`);

    return {
      subject: `Ya organizás ${input.communityName} en OWU`,
      html: layout({
        preheader: `Tu panel de ${input.communityName} está listo.`,
        body: `<p style="margin:0 0 16px">${esc(hi)}</p>
<p style="margin:0 0 16px">El staff de OWU confirmó que organizás <strong>${esc(input.communityName)}</strong>. Entrás como ${esc(roleLabel(input.role))}: ya podés ver el calendario de todas las comunidades, reservar fecha y armar tus eventos.</p>
<p style="margin:0 0 8px">${button(panel, "Abrir el panel")}</p>`,
      }),
      text: `${hi}\n\nEl staff de OWU confirmó que organizás ${input.communityName}. Entrás como ${roleLabel(input.role)}.\n\nAbrí el panel: ${panel}`,
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

/**
 * Someone gave you a role on OWU before you had it: on a community's team, or on the platform. It
 * takes effect when you sign in with the OWU Slack.
 */
export function accessInviteEmail(input: {
  inviterName: string;
  communityName: string | null;
  role: string;
}): Omit<Email, "to"> {
  const where = input.communityName ? `el equipo de ${input.communityName}` : "el staff de OWU";
  const login = appUrl("/login?next=/admin");

  return {
    subject: `${input.inviterName} te sumó a ${where}`,
    html: layout({
      preheader: `Entrá con el Slack de OWU para empezar como ${roleLabel(input.role)}.`,
      body: `<p style="margin:0 0 16px">Hola,</p>
<p style="margin:0 0 16px">${esc(input.inviterName)} te sumó a <strong>${esc(where)}</strong> como ${esc(roleLabel(input.role))}.</p>
<p style="margin:0 0 16px">Para empezar, entrá a OWU con tu cuenta del Slack de OWU (owu.slack.com): los roles necesitan ese Slack. Si todavía no estás, sumate primero.</p>
<p style="margin:0 0 8px">${button(login, "Entrar con Slack")}</p>`,
    }),
    text: `Hola,\n\n${input.inviterName} te sumó a ${where} como ${roleLabel(input.role)}.\n\nPara empezar, entrá a OWU con tu cuenta del Slack de OWU (owu.slack.com): ${login}`,
  };
}

/** Someone decided your request to access the dashboard or a community's team. */
export function accessRequestDecidedEmail(input: {
  name: string;
  communityName: string | null;
  role: string | null;
}): Omit<Email, "to"> {
  const hi = input.name ? `Hola ${input.name.split(" ")[0]},` : "Hola,";
  const where = input.communityName ? `al equipo de ${input.communityName}` : "al panel de OWU";
  if (input.role) {
    const panel = appUrl("/admin");

    return {
      subject: `Ya tenés acceso ${where}`,
      html: layout({
        preheader: `Entrás como ${roleLabel(input.role)}.`,
        body: `<p style="margin:0 0 16px">${esc(hi)}</p>
<p style="margin:0 0 16px">Aprobaron tu pedido de acceso ${esc(where)}. Entrás como ${esc(roleLabel(input.role))}.</p>
<p style="margin:0 0 8px">${button(panel, "Abrir el panel")}</p>`,
      }),
      text: `${hi}\n\nAprobaron tu pedido de acceso ${where}. Entrás como ${roleLabel(input.role)}.\n\n${panel}`,
    };
  }

  return {
    subject: `Tu pedido de acceso ${where}`,
    html: layout({
      preheader: "No lo pudieron aprobar esta vez.",
      body: `<p style="margin:0 0 16px">${esc(hi)}</p>
<p style="margin:0 0 16px">No pudieron aprobar tu pedido de acceso ${esc(where)} esta vez. Si creés que es un error, escribinos en el Slack de OWU.</p>`,
    }),
    text: `${hi}\n\nNo pudieron aprobar tu pedido de acceso ${where} esta vez. Si creés que es un error, escribinos en el Slack de OWU.`,
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
  | "left"
  | "removed"
  | "reminder_48h"
  | "reminder_2h"
  | "updated"
  | "event_cancelled"
  | "feedback";

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
  /** The post-event survey */
  surveyUrl?: string | null;
  /** The organizers' note: the reminders carry it */
  note?: string | null;
  /** Reminders and feedback can be turned off; the rest is essential */
  unsubscribeUrl?: string | null;
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
    reminder_48h: {
      subject: `Pasado mañana: ${input.event}. ¿Seguís yendo?`,
      lead: `${input.event} es en dos días. Si al final no podés, liberá tu lugar: hay gente en la lista de espera que lo aprovecha.`,
      action: ["Ver mi entrada", input.ticketUrl],
    },
    reminder_2h: {
      subject: `Hoy: ${input.event}, ${input.when.split(" · ")[1] ?? ""}`,
      lead: `Te esperamos en un rato. Acá tenés cómo llegar y tu entrada para mostrar en la puerta.`,
      action: ["Ver mi entrada", input.ticketUrl],
    },
    updated: {
      subject: `Cambió ${input.event}: ahora es el ${input.when}`,
      lead: `${input.community} cambió la fecha o el lugar. Ya actualizamos tu invitación del calendario. Si con el cambio no podés, liberá tu lugar.`,
      action: ["Ver mi entrada", input.ticketUrl],
    },
    event_cancelled: {
      subject: `Se canceló ${input.event}`,
      lead: `${input.community} canceló ${input.event}. Lo sacamos de tu calendario. Perdón por las molestias.`,
      action: ["Ver otros eventos", appUrl("/eventos")],
    },
    feedback: {
      subject: `¿Qué te pareció ${input.event}?`,
      lead: `Gracias por venir. Contale a ${input.community} qué te gustó y qué mejorarías: son dos minutos y ayuda a que el próximo salga mejor.`,
      action: ["Dar mi opinión", input.surveyUrl ?? input.pageUrl],
    },
    left: {
      subject: `Liberaste tu lugar: ${input.event}`,
      lead: `Listo, liberaste tu lugar. ¡Gracias por avisar! Si cambiás de idea, podés volver a anotarte.`,
      action: ["Ver el evento", input.pageUrl],
    },
    removed: {
      subject: `Se canceló tu inscripción: ${input.event}`,
      lead: `${input.community} canceló tu inscripción a ${input.event}. Si te parece un error, escribiles.`,
      action: ["Ver el evento", input.pageUrl],
    },
  };
  const { subject, lead, action } = copy[input.kind];
  const seat =
    input.kind === "confirmed" || input.kind === "promoted" || input.kind === "reminder_2h" || input.kind === "updated";
  const note = (input.kind === "reminder_48h" || input.kind === "reminder_2h") && input.note ? input.note : null;
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
${note ? `<p style="margin:0 0 16px;padding:12px;border-left:3px solid #F5BB03;background:#fffbeb;white-space:pre-line"><strong>${esc(input.community)} te avisa:</strong><br>${esc(note)}</p>` : ""}
${seat && input.qrUrl ? `<p style="margin:0 0 16px;text-align:center"><img alt="Código QR de tu entrada" height="180" src="${esc(input.qrUrl)}" style="border-radius:8px" width="180"></p>` : ""}
${extra.map((line) => `<p style="margin:0 0 12px;color:#52525b">${esc(line)}</p>`).join("")}
${action ? `<p style="margin:8px 0 0">${button(action[1], action[0])}</p>` : ""}
${input.unsubscribeUrl ? `<p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">¿No querés recordatorios? <a href="${esc(input.unsubscribeUrl)}" style="color:#a1a1aa">Dejá de recibirlos</a>.</p>` : ""}`,
    }),
    text: [
      hi,
      lead,
      `${input.event}\n${facts}`,
      note ? `${input.community} te avisa: ${note}` : "",
      ...extra,
      action ? `${action[0]}: ${action[1]}` : "",
      input.unsubscribeUrl ? `Dejar de recibir recordatorios: ${input.unsubscribeUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/** An organizer writing to the people of their event. Their text is escaped and kept as paragraphs. */
export function eventMessageEmail(input: {
  community: string;
  event: string;
  subject: string;
  body: string;
  pageUrl: string;
  /** Like reminders, these can be turned off */
  unsubscribeUrl: string;
}): Omit<Email, "to"> {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    subject: `${input.subject} · ${input.event}`,
    html: layout({
      preheader: paragraphs[0] ?? input.subject,
      body: `${paragraphs.map((paragraph) => `<p style="margin:0 0 14px;white-space:pre-line">${esc(paragraph)}</p>`).join("")}
<p style="margin:16px 0 0;color:#71717a;font-size:13px">${esc(input.community)}, por <a href="${esc(input.pageUrl)}" style="color:#71717a">${esc(input.event)}</a>.</p>
<p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">¿No querés recibir estos mails? <a href="${esc(input.unsubscribeUrl)}" style="color:#a1a1aa">Dejá de recibirlos</a>.</p>`,
    }),
    text: `${paragraphs.join("\n\n")}\n\n${input.community}, por ${input.event}: ${input.pageUrl}\n\nDejar de recibir estos mails: ${input.unsubscribeUrl}`,
  };
}

/** A community someone follows published an event. Optional: one click turns these off. */
export function followerNewEventEmail(input: {
  community: string;
  event: string;
  summary: string | null;
  when: string;
  place: string;
  pageUrl: string;
  profileUrl: string;
  unsubscribeUrl: string;
}): Omit<Email, "to"> {
  return {
    subject: `${input.community} publicó: ${input.event}`,
    html: layout({
      preheader: `${input.when} · ${input.place}`,
      body: `<p style="margin:0 0 6px;color:#71717a;font-size:13px">${esc(input.community)} publicó un evento</p>
<p style="margin:0 0 6px;font-size:20px;font-weight:700;line-height:1.3">${esc(input.event)}</p>
<p style="margin:0 0 16px;color:#52525b">${esc(input.when)} · ${esc(input.place)}</p>
${input.summary ? `<p style="margin:0 0 20px">${esc(input.summary)}</p>` : ""}<p style="margin:0 0 24px">${button(input.pageUrl, "Ver el evento")}</p>
<p style="margin:0;color:#71717a;font-size:12px">Te llegó porque seguís a ${esc(input.community)}. <a href="${esc(input.profileUrl)}" style="color:#71717a">Dejar de seguir</a> · <a href="${esc(input.unsubscribeUrl)}" style="color:#71717a">No recibir más avisos</a></p>`,
    }),
    text: `${input.community} publicó un evento: ${input.event}\n${input.when} · ${input.place}\n${input.summary ? `\n${input.summary}\n` : ""}\nVer el evento: ${input.pageUrl}\n\nTe llegó porque seguís a ${input.community}. Dejar de seguir: ${input.profileUrl}\nNo recibir más avisos: ${input.unsubscribeUrl}`,
  };
}

/** A community was asked to co-organize another's event: its organizers accept from the panel. */
export function cohostInviteEmail(input: {
  host: string;
  community: string;
  event: string;
  when: string;
  panelUrl: string;
}): Omit<Email, "to"> {
  return {
    subject: `${input.host} invita a ${input.community} a coorganizar «${input.event}»`,
    html: layout({
      preheader: `${input.when}. Aceptalo desde el panel de Organizá.`,
      body: `<p style="margin:0 0 16px">${esc(input.host)} quiere organizar <strong>${esc(input.event)}</strong> (${esc(input.when)}) junto con ${esc(input.community)}.</p>
<p style="margin:0 0 20px;color:#52525b">Si aceptan, el evento aparece también en el perfil de ${esc(input.community)} en owu.uy.</p>
<p style="margin:0">${button(input.panelUrl, "Ver la invitación")}</p>`,
    }),
    text: `${input.host} quiere organizar «${input.event}» (${input.when}) junto con ${input.community}.\n\nSi aceptan, el evento aparece también en el perfil de ${input.community} en owu.uy.\n\nVer la invitación: ${input.panelUrl}`,
  };
}

/** Another community asks which of a few days works for a joint event. */
export function datePollEmail(input: {
  asker: string;
  community: string;
  title: string;
  days: string[];
  panelUrl: string;
}): Omit<Email, "to"> {
  return {
    subject: `${input.asker} pregunta qué fecha le sirve a ${input.community}: ${input.title}`,
    html: layout({
      preheader: `${input.days.length} fechas posibles. Respondé desde el panel de Organizá.`,
      body: `<p style="margin:0 0 12px">${esc(input.asker)} quiere armar <strong>${esc(input.title)}</strong> con otras comunidades y pregunta qué días le sirven a ${esc(input.community)}:</p>
<ul style="margin:0 0 20px;padding-left:18px">${input.days.map((day) => `<li>${esc(day)}</li>`).join("")}</ul>
<p style="margin:0">${button(input.panelUrl, "Responder")}</p>`,
    }),
    text: `${input.asker} quiere armar «${input.title}» con otras comunidades y pregunta qué días le sirven a ${input.community}:\n${input.days.map((day) => `- ${day}`).join("\n")}\n\nResponder: ${input.panelUrl}`,
  };
}
