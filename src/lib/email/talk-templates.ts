import type { Email } from "./send";
import { appUrl, button, esc, layout } from "./templates";

/**
 * Emails about talks (/dar-una-charla and the panel's Charlas): to organizers when a talk is
 * proposed to them, and to the speaker from the claim to the thanks after the event.
 */

type Mail = Omit<Email, "to">;
type Contact = { name: string; email: string };

const p = (text: string, style = "margin:0 0 16px") => `<p style="${style}">${esc(text)}</p>`;
const muted = (text: string) => p(text, "margin:16px 0 0;color:#71717a;font-size:13px");
const contactLine = (organizer: Contact) =>
  `Para coordinar, escribile a ${organizer.name} (${organizer.email}), que organiza.`;

/** Someone proposed a talk to this community (to its editors and up). */
export function talkProposedEmail(input: {
  community: string;
  speaker: string;
  title: string;
  format: string;
  abstract: string;
  firstTime: boolean;
  panelUrl: string;
}): Mail {
  const line = `${input.speaker} propone «${input.title}» (${input.format}) para ${input.community}.`;
  const first = input.firstTime ? "Es su primera charla: ofrecele un ensayo." : "";

  return {
    subject: `Charla propuesta para ${input.community}: ${input.title}`,
    html: layout({
      preheader: line,
      body: `${p(line)}<p style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:8px;white-space:pre-line">${esc(input.abstract)}</p>
${first ? p(first) : ""}<p style="margin:0 0 8px">${button(input.panelUrl, "Ver en Charlas")}</p>
${muted("Si la quieren, tomala desde el panel: así ninguna otra comunidad la agenda el mismo mes.")}`,
    }),
    text: `${line}\n\n${input.abstract}\n${first ? `\n${first}\n` : ""}\nVer en Charlas: ${input.panelUrl}`,
  };
}

/** A community took the talk (to the speaker), with who to talk to. */
export function talkClaimedEmail(input: { title: string; community: string; organizer: Contact }): Mail {
  const line = `${input.community} quiere tu charla «${input.title}».`;
  const next =
    "Te van a escribir para elegir la fecha. Cuando la pongan en un evento, te avisamos con el día y el lugar.";

  return {
    subject: `${input.community} quiere tu charla`,
    html: layout({ preheader: line, body: `${p(line)}${p(next)}${p(contactLine(input.organizer))}` }),
    text: `${line}\n\n${next}\n\n${contactLine(input.organizer)}`,
  };
}

/** The talk is on an event (to the speaker). */
export function talkScheduledEmail(input: {
  title: string;
  community: string;
  event: string;
  when: string;
  place: string;
  pageUrl: string | null;
  organizer: Contact | null;
}): Mail {
  const line = `Tu charla «${input.title}» va en ${input.event}, de ${input.community}.`;
  const facts = [`Cuándo: ${input.when}`, `Dónde: ${input.place}`];
  const later = input.pageUrl ? "" : "La página del evento sale cuando lo publiquen; te la mandamos antes de la fecha.";

  return {
    subject: `Tu charla va el ${input.when}`,
    html: layout({
      preheader: `${input.when} · ${input.place}`,
      body: `${p(line)}<p style="margin:0 0 16px;font-family:'Geist Mono',ui-monospace,Menlo,monospace">${facts.map(esc).join("<br>")}</p>
${input.pageUrl ? `<p style="margin:0 0 16px">${button(input.pageUrl, "Ver el evento")}</p>` : p(later)}${input.organizer ? p(contactLine(input.organizer)) : ""}`,
    }),
    text: [line, facts.join("\n"), input.pageUrl ? `Ver el evento: ${input.pageUrl}` : later]
      .concat(input.organizer ? [contactLine(input.organizer)] : [])
      .join("\n\n"),
  };
}

/** The speaker withdrew a talk this community had taken (to whoever took it). */
export function talkWithdrawnEmail(input: { title: string; speaker: string; panelUrl: string }): Mail {
  const line = `${input.speaker} retiró «${input.title}». Ya no está en tus charlas tomadas.`;
  const next = "Si estaba en un evento, ya la sacamos de la agenda. Buscá otra en Charlas.";

  return {
    subject: `${input.speaker} retiró su charla`,
    html: layout({
      preheader: line,
      body: `${p(line)}${p(next)}<p style="margin:0 0 8px">${button(input.panelUrl, "Buscar otra charla")}</p>`,
    }),
    text: `${line}\n\n${next}\n\n${input.panelUrl}`,
  };
}

const PACK = [
  "La pantalla es 16:9: armá las slides en ese formato.",
  "Traé tu adaptador a HDMI o USB-C, por las dudas.",
  "Llegá 30 minutos antes para probar la compu, el audio y el adaptador.",
];

/** T−14 d: the date stands, and what to know (to the speaker). */
export function speakerConfirmEmail(input: {
  title: string;
  event: string;
  when: string;
  place: string;
  pageUrl: string;
  recordingOk: boolean;
  organizer: Contact | null;
}): Mail {
  const line = `Faltan dos semanas para tu charla «${input.title}» en ${input.event}: ${input.when}, ${input.place}.`;
  const recording = input.recordingOk
    ? "Dijiste que se puede grabar. Si cambiaste de idea, avisale a quien organiza."
    : "Dijiste que no se graba: quien organiza ya lo sabe.";
  const conduct = appUrl("/codigo-de-conducta");
  const lines = [...PACK, recording, `Los eventos de OWU siguen el código de conducta: ${conduct}`];

  return {
    subject: `Faltan dos semanas para tu charla en ${input.event}`,
    html: layout({
      preheader: `${input.when} · ${input.place}`,
      body: `${p(line)}<ul style="margin:0 0 16px;padding-left:18px">${lines.map((item) => `<li style="margin:0 0 6px">${esc(item)}</li>`).join("")}</ul>
<p style="margin:0 0 16px">${button(input.pageUrl, "Ver el evento")}</p>${input.organizer ? p(contactLine(input.organizer)) : ""}`,
    }),
    text: [line, lines.map((item) => `- ${item}`).join("\n"), `Ver el evento: ${input.pageUrl}`]
      .concat(input.organizer ? [contactLine(input.organizer)] : [])
      .join("\n\n"),
  };
}

/** T−2 d: slides and anything they need (to the speaker). */
export function speakerSoonEmail(input: {
  title: string;
  event: string;
  when: string;
  place: string;
  organizer: Contact | null;
}): Mail {
  const line = `Tu charla «${input.title}» es el ${input.when} en ${input.place}.`;
  const ask = input.organizer
    ? `¿Le mandás las slides a ${input.organizer.name} (${input.organizer.email})? Y si necesitás algo, decile ahora.`
    : "¿Mandás las slides a quien organiza? Y si necesitás algo, avisá ahora.";

  return {
    subject: `¿Mandás las slides? Tu charla es el ${input.when}`,
    html: layout({
      preheader: ask,
      body: `${p(line)}${p(ask)}<ul style="margin:0;padding-left:18px">${PACK.map((item) => `<li style="margin:0 0 6px">${esc(item)}</li>`).join("")}</ul>`,
    }),
    text: `${line}\n\n${ask}\n\n${PACK.map((item) => `- ${item}`).join("\n")}`,
  };
}

/** T+1 d: thanks, and a link to send the slides or the recording (to the speaker). */
export function speakerThanksEmail(input: { title: string; event: string; community: string; link: string }): Mail {
  const line = `¡Gracias por dar «${input.title}» en ${input.event}! ${input.community} y la comunidad te lo agradecen.`;
  const ask =
    "Si querés, pegá el link a tus slides o a la grabación: salen en la página del evento para quien no pudo ir.";

  return {
    subject: `¡Gracias por tu charla en ${input.event}!`,
    html: layout({
      preheader: ask,
      body: `${p(line)}${p(ask)}<p style="margin:0 0 8px">${button(input.link, "Sumar slides o grabación")}</p>
${muted("El link sirve una vez y vence en 30 días.")}`,
    }),
    text: `${line}\n\n${ask}\n\n${input.link}\n\nEl link sirve una vez y vence en 30 días.`,
  };
}
