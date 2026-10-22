import { experimental_upgradeWebSocket } from "@vercel/functions";
import { headers } from "next/headers";

import { principalFromRequest } from "app/lib/auth-helpers";
import { can } from "lib/authz/principal";
import { hub } from "lib/realtime/hub";

// WebSocket connections should live as long as the platform allows.
export const maxDuration = 300;

/**
 * Browsers do not apply the same-origin policy to WebSocket handshakes, but
 * they do send cookies with them. Without this check, any page a logged-in
 * admin happens to visit could open a socket as them and publish to every
 * connected board and kiosk.
 *
 * The Origin is compared against the host actually being served, so community
 * custom domains keep working without a list to maintain.
 */
function isSameOrigin(requestHeaders: Headers): boolean {
  const origin = requestHeaders.get("origin");
  // Only browsers can be tricked into this, and a browser always sends Origin
  // on an upgrade — so allowing origin-less clients is not a way around it.
  if (!origin) return true;

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function GET() {
  const requestHeaders = await headers();

  if (!isSameOrigin(requestHeaders)) {
    return new Response("Forbidden", { status: 403 });
  }

  // The upgrade request carries cookies like any GET. Publishing and private channels take
  // `realtime` rights (site staff), asked again at most every 30 s while the socket lives, so a
  // role taken away or a revoked session stops it too. Public displays subscribe without a session.
  const captured = new Headers(requestHeaders);
  let decided: { at: number; allowed: Promise<boolean> } | null = null;
  const canPublish = () => {
    if (!decided || Date.now() - decided.at > 30_000) {
      decided = {
        at: Date.now(),
        allowed: principalFromRequest(captured)
          .then((principal) => can(principal, "stage:operate"))
          .catch(() => false),
      };
    }

    return decided.allowed;
  };

  return experimental_upgradeWebSocket((ws) => {
    hub.attach(ws, { canPublish });
  });
}
