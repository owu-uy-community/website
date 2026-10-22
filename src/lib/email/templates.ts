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
