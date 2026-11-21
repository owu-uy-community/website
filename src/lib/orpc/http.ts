import { Effect } from "effect";
import type * as z from "zod";

import { UpstreamFailed } from "./errors";

type FetchJsonOptions = RequestInit & { timeoutMs?: number };

/**
 * GET (or whatever `init` says) a JSON API we depend on, with a timeout and a
 * schema check on the answer. Any failure — network, status, timeout, a shape
 * we did not expect — is an `UpstreamFailed` naming the service, never a crash.
 */
export const fetchJson = <S extends z.ZodType>(
  service: string,
  url: string,
  schema: S,
  { timeoutMs = 8000, ...init }: FetchJsonOptions = {}
): Effect.Effect<z.output<S>, UpstreamFailed> =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
      if (!response.ok) throw new Error(`${service} answered ${response.status}`);

      return schema.parse(await response.json());
    },
    catch: (cause) =>
      new UpstreamFailed({
        service,
        message: `No pudimos hablar con ${service}`,
        cause,
      }),
  });
