import { principalFromRequest } from "app/lib/auth-helpers";
import { can } from "lib/authz/principal";
import {
  assertVoiceRequest,
  readVoiceScopes,
  requestBridgeTicket,
  signBridgeTicket,
  VoiceHttpError,
  VoiceQuota,
  voiceFailure,
  voiceResponse,
} from "lib/companion/voice-bridge.server";

export const maxDuration = 20;
const quota = new VoiceQuota();
export async function POST(request: Request) {
  try {
    assertVoiceRequest(request);
    const principal = await principalFromRequest(request.headers);
    if (!principal) throw new VoiceHttpError(401, "Sign in to use web voice.");
    if (!(await can(principal, "stage:operate"))) throw new VoiceHttpError(403, "Admin access required.");
    const scopes = await readVoiceScopes(request);
    quota.take(principal.id);
    const origin = new URL(request.url).origin;
    const secret = process.env.COMPANION_BRIDGE_SECRET;
    // A reachable bridge issues its own tickets; a bridge on the venue laptop (only its browser
    // reaches it) takes one the site signs with the shared secret.
    return voiceResponse(
      process.env.COMPANION_BRIDGE_URL || !process.env.COMPANION_BRIDGE_PUBLIC_URL
        ? await requestBridgeTicket(principal.id, origin, scopes, { url: process.env.COMPANION_BRIDGE_URL, secret })
        : signBridgeTicket(principal.id, origin, scopes, { publicUrl: process.env.COMPANION_BRIDGE_PUBLIC_URL, secret })
    );
  } catch (error) {
    return voiceFailure(error);
  }
}
