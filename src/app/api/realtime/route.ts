import { experimental_upgradeWebSocket } from "@vercel/functions";
import { headers } from "next/headers";

import { auth } from "app/lib/auth";
import { hub } from "lib/realtime/hub";

// WebSocket connections should live as long as the platform allows.
export const maxDuration = 300;

export async function GET() {
  // The upgrade request carries cookies like any GET: resolve the session to
  // decide publish rights. Public displays (kiosk/countdown) subscribe without one.
  let canPublish = false;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    // @ts-expect-error - role comes from Better Auth additionalFields; its types don't carry it
    canPublish = session?.user?.role === "admin";
  } catch {
    canPublish = false;
  }

  return experimental_upgradeWebSocket((ws) => {
    hub.attach(ws, { canPublish });
  });
}
