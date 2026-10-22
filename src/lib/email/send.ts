import { deliverToMailbox, mailboxEnabled } from "./mailbox";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

const RESEND_URL = "https://api.resend.com/emails";
const from = () => process.env.EMAIL_FROM ?? "OWU <hola@mail.owu.uy>";

/**
 * Send one email through Resend's REST API. Without a key it lands in the dev mailbox, or is
 * dropped with a warning. `idempotencyKey` makes a retried send go out once (Resend keeps it 24 h).
 */
export async function sendEmail(email: Email, idempotencyKey?: string): Promise<{ id: string | null }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (mailboxEnabled()) return { id: deliverToMailbox(email) };
    console.warn(`[email] RESEND_API_KEY is not set: dropped «${email.subject}»`);

    return { id: null };
  }

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: from(),
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend answered ${response.status}: ${(await response.text()).slice(0, 300)}`);

  return { id: ((await response.json()) as { id: string }).id };
}
