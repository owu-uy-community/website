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
