import type { Email } from "./send";
import { button, esc, layout } from "./templates";

const hello = (name: string) => (name ? `Hola ${name.split(" ")[0]},` : "Hola,");

const unsubscribe = (url: string) => ({
  html: `<p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">¿No querés estos mails? <a href="${esc(url)}" style="color:#a1a1aa">Dejá de recibirlos</a>.</p>`,
  text: `Dejar de recibir estos mails: ${url}`,
});

/**
 * Someone's first sign-up to a community: what the night looks like, how to get in, and that
 * someone greets them. Optional (one click turns it off), once per community and person.
 */
export function firstTimeEmail(input: {
  name: string;
  community: string;
  event: string;
  when: string;
  place: string;
  /** The team's note for the reminders (how to get in), if any */
  note: string | null;
  pageUrl: string;
  ticketUrl: string;
  unsubscribeUrl: string;
}): Omit<Email, "to"> {
  const hi = hello(input.name);
  const lead = `Es tu primera vez con ${input.community}: ¡te damos la bienvenida! Te contamos cómo es, así llegás sin dudas.`;
  const steps = [
    `Cuándo y dónde: ${input.when} · ${input.place}.`,
    "En la puerta mostrás el QR de tu entrada (está en el mail de confirmación y en el link de abajo). Si no lo tenés a mano, alcanza con tu nombre.",
    `Alguien de ${input.community} te recibe en la entrada: decile que es tu primera vez y te presenta a la gente.`,
    "Suele arrancar con un rato para conocerse, después las charlas y al final más charla. No hace falta saber nada de antes.",
  ];
  const out = unsubscribe(input.unsubscribeUrl);

  return {
    subject: `Tu primera vez con ${input.community}: cómo es`,
    html: layout({
      preheader: lead,
      body: `<p style="margin:0 0 16px">${esc(hi)}</p>
<p style="margin:0 0 16px">${esc(lead)}</p>
<ul style="margin:0 0 16px;padding-left:18px">${steps.map((step) => `<li style="margin:0 0 8px">${esc(step)}</li>`).join("")}</ul>
${input.note ? `<p style="margin:0 0 16px;padding:12px;border-left:3px solid #F5BB03;background:#fffbeb;white-space:pre-line"><strong>${esc(input.community)} te avisa:</strong><br>${esc(input.note)}</p>` : ""}
<p style="margin:8px 0 0">${button(input.pageUrl, "Ver el evento y la agenda")}</p>
<p style="margin:12px 0 0;font-size:13px"><a href="${esc(input.ticketUrl)}" style="color:#52525b">Ver mi entrada</a></p>
${out.html}`,
    }),
    text: [
      hi,
      lead,
      steps.map((step) => `- ${step}`).join("\n"),
      input.note ? `${input.community} te avisa: ${input.note}` : "",
      `El evento y la agenda: ${input.pageUrl}`,
      `Tu entrada: ${input.ticketUrl}`,
      out.text,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/**
 * After someone's second silent no-show in a community (only if its team turned this on): a
 * friendly note, never a ban. Optional mail, once per community and person.
 */
export function noShowNudgeEmail(input: {
  name: string;
  community: string;
  profileUrl: string;
  unsubscribeUrl: string;
}): Omit<Email, "to"> {
  const hi = hello(input.name);
  const lines = [
    `Te escribimos de parte de ${input.community}. Las últimas veces te anotaste y no pudiste venir, y está todo bien: a todos nos pasa.`,
    "La próxima, si no podés, liberá tu lugar desde el mail de recordatorio o tu entrada: es un toque, y alguien de la lista de espera lo aprovecha.",
    "¡Te esperamos en el próximo!",
  ];
  const out = unsubscribe(input.unsubscribeUrl);

  return {
    subject: `${input.community}: la próxima, si no podés, liberá tu lugar`,
    html: layout({
      preheader: lines[1] ?? "",
      body: `<p style="margin:0 0 16px">${esc(hi)}</p>
${lines.map((line) => `<p style="margin:0 0 14px">${esc(line)}</p>`).join("")}
<p style="margin:8px 0 0">${button(input.profileUrl, `Ver los eventos de ${input.community}`)}</p>
${out.html}`,
    }),
    text: [hi, ...lines, `Los eventos de ${input.community}: ${input.profileUrl}`, out.text].join("\n\n"),
  };
}
