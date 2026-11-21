import type { EmailAttachment } from "../db/schema";
import { deliverToMailbox, mailboxEnabled } from "./mailbox";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
  /** What the email is ("otp", "follower_new_event"…): news goes from its own address */
  kind?: string;
};

/** Resend refused the email; `status` tells a bad address (4xx) from a busy service (429, 5xx). */
export class SendFailed extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }

  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

/** Whether mail can go anywhere: a Resend key, or the dev mailbox. */
export const canSendEmail = () => Boolean(process.env.RESEND_API_KEY) || mailboxEnabled();

const RESEND_URL = "https://api.resend.com/emails";
/** News to followers goes from its own subdomain, so its reputation never holds back a sign-in code. */
const NEWS = new Set(["follower_new_event"]);
const from = (kind?: string) =>
  (kind && NEWS.has(kind) ? process.env.EMAIL_FROM_NEWS : undefined) ??
  process.env.EMAIL_FROM ??
  "OWU <hola@mail.owu.uy>";

/**
 * Send one email through Resend's REST API; without a key, to the dev mailbox. With neither it
 * fails rather than pretend: a sign-in code that never leaves must say so. `idempotencyKey` makes a
 * retried send go out once (Resend keeps it 24 h).
 */
export async function sendEmail(email: Email, idempotencyKey?: string): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (mailboxEnabled()) return { id: deliverToMailbox(email) };
    throw new Error("RESEND_API_KEY is not set: email can't be sent");
  }

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: from(email.kind),
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
      attachments: email.attachments?.map((file) => ({
        filename: file.filename,
        content: file.content,
        content_type: file.contentType,
      })),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new SendFailed(
      response.status,
      `Resend answered ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }

  return { id: ((await response.json()) as { id: string }).id };
}
