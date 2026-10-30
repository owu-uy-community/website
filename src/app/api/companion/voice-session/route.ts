import { principalFromRequest } from "app/lib/auth-helpers";
import { can } from "lib/authz/principal";
import {
  assertVoiceRequest,
  readVoiceScopes,
  requestBridgeTicket,
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
    return voiceResponse(
      await requestBridgeTicket(principal.id, new URL(request.url).origin, scopes, {
        url: process.env.COMPANION_BRIDGE_URL,
        secret: process.env.COMPANION_BRIDGE_SECRET,
      })
    );
  } catch (error) {
    return voiceFailure(error);
  }
}
