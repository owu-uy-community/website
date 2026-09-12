import { auth } from "app/lib/auth";
import { isSiteAdmin } from "app/lib/auth-helpers";
import {
  assertVoiceRequest,
  readVoiceScopes,
  requestBridgeTicket,
  VoiceHttpError,
  VoiceQuota,
  voiceFailure,
  voiceResponse,
} from "lib/companion/voice-bridge.server";

export const runtime = "nodejs";
export const maxDuration = 20;
const quota = new VoiceQuota();
export async function POST(request: Request) {
  try {
    assertVoiceRequest(request);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new VoiceHttpError(401, "Sign in to use web voice.");
    if (!isSiteAdmin(session)) throw new VoiceHttpError(403, "Admin access required.");
    const scopes = await readVoiceScopes(request);
    quota.take(session.user.id);
    return voiceResponse(
      await requestBridgeTicket(session.user.id, new URL(request.url).origin, scopes, {
        url: process.env.COMPANION_BRIDGE_URL,
        secret: process.env.COMPANION_BRIDGE_SECRET,
      })
    );
  } catch (error) {
    return voiceFailure(error);
  }
}
