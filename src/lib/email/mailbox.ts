import { randomUUID } from "node:crypto";

import type { Email } from "./send";

export type MailboxMessage = Email & { id: string; at: string };

const store = globalThis as { owuMailbox?: MailboxMessage[] };

/**
 * Without a Resend key, local dev and the e2e build (EMAIL_MAILBOX=1) keep sent mail in memory, so
 * people and tests can read sign-in codes. Never on a deployment with a key.
 */
export const mailboxEnabled = () =>
  !process.env.RESEND_API_KEY && (process.env.NODE_ENV === "development" || process.env.EMAIL_MAILBOX === "1");

export function deliverToMailbox(email: Email) {
  const box = (store.owuMailbox ??= []);
  const id = randomUUID();
  box.push({ ...email, to: email.to.toLowerCase(), id, at: new Date().toISOString() });
  // ponytail: a ring buffer per process; enough for one dev server or one e2e run.
  if (box.length > 200) box.shift();

  return id;
}

/** Newest first, optionally only one recipient's. */
export const mailboxMessages = (to?: string | null) =>
  (store.owuMailbox ?? []).filter((message) => !to || message.to === to.toLowerCase()).toReversed();
