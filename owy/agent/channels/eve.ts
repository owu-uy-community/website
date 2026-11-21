import { eveChannel } from "eve/channels/eve";
import { type AuthFn, extractBearerToken, localDev } from "eve/channels/auth";

import { verifyOwuKey } from "../lib/owu-api";

/**
 * Owy's own HTTP channel (the operator's console). Local loopback requests stay frictionless (eve
 * dev TUI). Anything else needs an OWU API key holding `owy:operate` (mint one in /admin/acceso →
 * Llaves API, preset "owy-operator"), sent as `Authorization: Bearer <key>` or `x-api-key`. The
 * site checks it, so revoking the key there locks the console here; no credential lives in env.
 */
const owuKeyAuth: AuthFn<Request> = async (request) => {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (new URL(request.url).protocol !== "https:" && forwardedProtocol !== "https") return null;
  const key = request.headers.get("x-api-key") ?? extractBearerToken(request.headers.get("authorization"));
  const operator = key ? await verifyOwuKey(key) : null;
  if (!operator) return null;

  return {
    authenticator: "owu-key",
    principalId: operator.id,
    principalType: "user",
    attributes: { name: operator.name },
  };
};

export default eveChannel({
  auth: process.env.NODE_ENV === "production" ? [owuKeyAuth] : [localDev(), owuKeyAuth],
  uploadPolicy: "disabled",
});
