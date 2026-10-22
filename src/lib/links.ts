import { sign, unsign } from "@orpc/server/helpers";

/** What a signed link is for: a token made for one purpose never opens another. */
export type LinkPurpose = "venue-request" | "rsvp" | "unsubscribe" | "ticket" | "door";

const secret = () => {
  const value = process.env.ORGANIZAR_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("ORGANIZAR_SECRET (or BETTER_AUTH_SECRET) must be set");

  return value;
};

/**
 * A token for a link that works without signing in (a host answering a request, a ticket, an
 * unsubscribe): an HMAC over the purpose, the id and an optional expiry.
 */
export function signLink(purpose: LinkPurpose, id: string, expiresAt?: Date) {
  const exp = expiresAt ? Math.floor(expiresAt.getTime() / 1000).toString(36) : "";

  return sign(`${purpose}~${id}~${exp}`, secret());
}

/** The id a token was made for, or null when it's forged, for another purpose or expired. */
export async function readLink(purpose: LinkPurpose, token: string, now = Date.now()) {
  const value = await unsign(token, secret());
  const [tokenPurpose, id, exp] = value?.split("~") ?? [];
  if (tokenPurpose !== purpose || !id) return null;
  if (exp && Number.parseInt(exp, 36) * 1000 < now) return null;

  return id;
}
