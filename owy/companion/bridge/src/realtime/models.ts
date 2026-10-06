import { createGoogle } from "@ai-sdk/google";
import { createGateway, type Experimental_RealtimeModel, type Experimental_RealtimeSessionConfig } from "ai";

/**
 * Provider selection for the realtime session.
 *
 * Spec format: `<provider>:<modelId>` —
 *   - `gateway:<vendor>/<model>` (default `gateway:google/gemini-3.8-live`; needs
 *     AI_GATEWAY_API_KEY): `google/gemini-3.8-live`, `google/gemini-3.8-live-extended-thinking`,
 *     `openai/gpt-realtime-2`, `openai/gpt-realtime-2.1`, `openai/gpt-realtime-mini`.
 *     Not `openai/gpt-live-1`: GPT-Live is a different (continuous, server-websocket)
 *     protocol that this turn-based session does not speak. The gateway rejects
 *     `turnDetection` and Gemini-native setup keys for Gemini models (see buildSessionConfig).
 *   - `google:gemini-3.8-live` (needs GOOGLE_GENERATIVE_AI_API_KEY): same model straight
 *     from Google, with VAD tuning, context compression and session resumption. Also
 *     `gemini-3.8-live-extended-thinking`; `gemini-3.1-flash-live-preview` is legacy.
 *
 * Both providers expose the same `RealtimeModelV4` codec interface, which is
 * what `NodeRealtimeSession` drives over a plain WebSocket.
 */

export interface RealtimeToken {
  token: string;
  url: string;
  expiresAt?: number;
}

export interface RealtimeProvider {
  readonly spec: string;
  readonly provider: "google" | "gateway";
  readonly modelId: string;
  readonly model: Experimental_RealtimeModel;
  /** Mints a fresh short-lived token. Google tokens are single-use: call once per connection. */
  getToken(sessionConfig: Experimental_RealtimeSessionConfig, expiresAfterSeconds?: number): Promise<RealtimeToken>;
}

export interface ResolveModelOptions {
  googleApiKey?: string;
  gatewayApiKey?: string;
}

export function parseModelSpec(spec: string): { provider: "google" | "gateway"; modelId: string } {
  const [provider, ...rest] = spec.split(":");
  const modelId = rest.join(":");
  if ((provider !== "google" && provider !== "gateway") || modelId.length === 0) {
    throw new Error(
      `COMPANION_REALTIME_MODEL inválido: "${spec}" (esperado google:<modelo> o gateway:<proveedor/modelo>)`
    );
  }
  return { provider, modelId };
}

export function resolveRealtimeProvider(spec: string, options: ResolveModelOptions = {}): RealtimeProvider {
  const { provider, modelId } = parseModelSpec(spec);

  if (provider === "google") {
    const apiKey = options.googleApiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Falta GOOGLE_GENERATIVE_AI_API_KEY (o usá gateway:google/gemini-3.8-live con AI_GATEWAY_API_KEY)."
      );
    }
    const google = createGoogle({ apiKey });
    return {
      spec,
      provider,
      modelId,
      model: google.experimental_realtime(modelId),
      getToken: (sessionConfig, expiresAfterSeconds = 300) =>
        google.experimental_realtime.getToken({ model: modelId, sessionConfig, expiresAfterSeconds }),
    };
  }

  const apiKey = options.gatewayApiKey ?? process.env.AI_GATEWAY_API_KEY;
  const gateway = createGateway(apiKey ? { apiKey } : {});
  return {
    spec,
    provider,
    modelId,
    model: gateway.experimental_realtime(modelId),
    getToken: (sessionConfig, expiresAfterSeconds = 300) =>
      gateway.experimental_realtime.getToken({ model: modelId, sessionConfig, expiresAfterSeconds }),
  };
}
