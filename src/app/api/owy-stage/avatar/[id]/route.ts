import { Effect } from "effect";

import { gravatarUrl } from "lib/gravatar";
import { arrivalAvatar } from "lib/orpc/owy-stage/service";
import { liveServices } from "lib/orpc/services";

/**
 * A welcome-wall tile's picture, by attendee id, so the wall never holds an email: the person's
 * OWU account picture, else Gravatar, else the GitHub account behind the address. Only for someone
 * the wall shows (checked in to its event, not off photos); a 404 leaves their initials up.
 * The bytes are relayed rather than redirected: a redirect would hand out the email's hash.
 */

const SIZE = 400;
/** GitHub answers an address it doesn't know with this same blank picture. ponytail: by etag; if GitHub changes it, unknown people show it until this is updated. */
const GITHUB_BLANK = '"6fc333308ecddc5d9d3c67b9df7f74161551c2cfa5f7229eb1286693ed377401"';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await Effect.runPromiseWith(liveServices)(arrivalAvatar(id)).catch(() => null);
  const email = person?.email.trim().toLowerCase() ?? "";
  const sources = [
    // Account pictures are whatever URL the account holds: only https ones are fetched
    person?.image?.startsWith("https://") ? person.image : null,
    email ? await gravatarUrl(email, SIZE, "404") : null,
    email ? `https://avatars.githubusercontent.com/u/e?email=${encodeURIComponent(email)}&s=${SIZE}` : null,
  ];

  for (const url of sources) {
    if (!url) continue;
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) }).catch(() => null);
    const type = response?.headers.get("content-type") ?? "";
    if (response?.ok && type.startsWith("image/") && response.headers.get("etag") !== GITHUB_BLANK) {
      return new Response(response.body, {
        headers: { "content-type": type, "cache-control": "public, max-age=3600, s-maxage=3600" },
      });
    }
    await response?.body?.cancel();
  }

  return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=300, s-maxage=300" } });
}
