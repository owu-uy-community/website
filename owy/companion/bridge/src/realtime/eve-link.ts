import type { Logger } from "../log";

/**
 * Client for the agent's voice channel (`agent/channels/companion.ts`).
 *
 * In "eve brain" mode the realtime speech model only hears and speaks; every
 * turn's text goes to the *same* Owy that answers on Slack/Telegram — one
 * durable eve session per device (memory, follow-ups, tools, staff gating).
 *
 *   POST {url}/companion/:deviceId/turns   → { sessionId, streamIndex }
 *   GET  {url}/companion/sessions/:id/stream?startIndex=N   NDJSON until `session.waiting`
 *   POST {url}/companion/:deviceId/cancel | /reset
 */

export interface EveLinkOptions {
  /** Base URL of the eve app (e.g. http://127.0.0.1:2000 or https://owy.vercel.app). */
  url: string;
  /** Basic auth for the channel routes (required outside `eve dev`). */
  basic?: { username: string; password: string } | null;
  logger: Logger;
  fetch?: typeof fetch;
  /** Hard cap for one turn (model + tools) before the bridge gives up. */
  turnTimeoutMs?: number;
}

/** What the bridge already made of a pitch, so eve reacts to it instead of re-doing it. */
export interface PitchContext {
  title: string;
  speaker: string | null;
  needsTV: boolean;
  needsWhiteboard: boolean;
  description: string | null;
  topics: string[];
}

export interface EveTurnOptions {
  staff: boolean;
  marketplaceOpen: boolean;
  eventName?: string;
  /** `pitch`: `text` is the transcript of a pitch whose card already exists; eve answers with a short reaction only. */
  kind?: "chat" | "pitch";
  pitch?: PitchContext;
  /** Cap for this turn instead of the link's default. */
  timeoutMs?: number;
  /** Running text of the assistant message being written (captions). */
  onDelta?: (text: string) => void;
  /** A tool the agent is running (UI hint). */
  onTool?: (toolName: string) => void;
  signal?: AbortSignal;
}

export interface EveTurnResult {
  sessionId: string;
  /** Final spoken answer (the last completed assistant message). */
  text: string;
  /** Interim messages emitted before tool calls, in order. */
  interim: string[];
}

interface StreamEvent {
  type: string;
  data?: Record<string, unknown>;
}

const TERMINAL = new Set(["session.waiting", "turn.failed", "turn.cancelled", "session.failed", "session.completed"]);

export class EveLink {
  private readonly fetchImpl: typeof fetch;
  private readonly log: Logger;
  private readonly turnTimeoutMs: number;
  private readonly base: string;
  private readonly authHeader: string | null;

  constructor(private readonly options: EveLinkOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.log = options.logger;
    this.turnTimeoutMs = options.turnTimeoutMs ?? 90_000;
    this.base = options.url.replace(/\/+$/, "");
    this.authHeader = options.basic
      ? `Basic ${Buffer.from(`${options.basic.username}:${options.basic.password}`).toString("base64")}`
      : null;
  }

  async turn(deviceId: string, text: string, options: EveTurnOptions): Promise<EveTurnResult> {
    const started = Date.now();
    const accepted = (await this.json(`/companion/${encodeURIComponent(deviceId)}/turns`, {
      text,
      staff: options.staff,
      marketplaceOpen: options.marketplaceOpen,
      eventName: options.eventName,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.pitch ? { pitch: options.pitch } : {}),
    })) as { sessionId: string; streamIndex: number };

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const deadline = setTimeout(() => controller.abort(), options.timeoutMs ?? this.turnTimeoutMs);

    try {
      const response = await this.fetchImpl(
        `${this.base}/companion/sessions/${encodeURIComponent(accepted.sessionId)}/stream?startIndex=${accepted.streamIndex}`,
        { headers: this.headers(), signal: controller.signal }
      );
      if (!response.ok || !response.body) throw new Error(`eve stream ${response.status}`);

      const result: EveTurnResult = { sessionId: accepted.sessionId, text: "", interim: [] };
      let current = "";
      for await (const event of ndjson(response.body)) {
        const data = event.data ?? {};
        switch (event.type) {
          case "message.appended":
            current += String(data.messageDelta ?? "");
            options.onDelta?.(current);
            break;
          case "message.completed": {
            const message = typeof data.message === "string" ? data.message : current;
            current = "";
            if (data.finishReason === "tool-calls") {
              if (message.trim()) result.interim.push(message.trim());
            } else if (message.trim()) {
              result.text = message.trim();
            }
            break;
          }
          case "actions.requested":
            for (const action of (data.actions as { toolName?: string }[] | undefined) ?? []) {
              if (action.toolName) options.onTool?.(action.toolName);
            }
            break;
          case "input.requested":
            // Voice cannot render buttons; unpark the session and answer for it.
            this.log.warn("eve asked for human input during a voice turn; cancelling");
            void this.cancel(deviceId);
            result.text ||= "Eso necesita una confirmación que no puedo pedir por acá; pedíselo al staff en Slack.";
            return result;
          case "turn.failed":
          case "session.failed":
            throw new Error(`eve turn failed: ${String(data.message ?? data.code ?? event.type)}`);
        }
        if (TERMINAL.has(event.type)) break;
      }
      if (!result.text && result.interim.length) result.text = result.interim[result.interim.length - 1];
      this.log.info(`eve turn ${accepted.sessionId} done in ${Date.now() - started} ms`);
      return result;
    } finally {
      clearTimeout(deadline);
      options.signal?.removeEventListener("abort", onAbort);
      controller.abort();
    }
  }

  async cancel(deviceId: string): Promise<void> {
    await this.json(`/companion/${encodeURIComponent(deviceId)}/cancel`, {}).catch((error) => {
      this.log.warn("eve cancel failed", error);
    });
  }

  /** Retires the device's conversation: the next turn starts a fresh session. */
  async reset(deviceId: string): Promise<void> {
    await this.json(`/companion/${encodeURIComponent(deviceId)}/reset`, {}).catch((error) => {
      this.log.warn("eve reset failed", error);
    });
  }

  private headers(): Record<string, string> {
    return this.authHeader ? { authorization: this.authHeader } : {};
  }

  private async json(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`eve ${path} → ${response.status} ${(await response.text()).slice(0, 200)}`);
    return response.json();
  }
}

async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as StreamEvent;
        } catch {
          // transport control records or partial garbage: ignore
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
