import type { Experimental_DecisionModel, LanguageModel } from "ai";
import { Context, Effect } from "effect";

import { db, type Db } from "../db";
import { publishServer } from "../realtime/publish";

/**
 * Effect services the procedures run against. Services that hold a plain
 * value (the database, a publisher) are built once per server instance in
 * `liveServices`; per-request ones (who is calling, which community) are
 * added by the access middleware in base.ts. Tests swap any of them through
 * the oRPC context (see src/test/context.ts).
 */

/** The database, or the transaction the current effect runs in. */
export class Database extends Context.Service<Database, Db>()("owu/Database") {}

/** Fan-out to connected screens. Best-effort: publishing never fails a request. */
export class Realtime extends Context.Service<
  Realtime,
  { readonly publish: (channel: string, event: string, payload: unknown) => Effect.Effect<void> }
>()("owu/Realtime") {}

/**
 * Resolves an AI Gateway slug (`google/gemini-…`, `typesafe-ai/jev`) to the
 * model to call. Live it is the slug itself — `ai` routes plain slugs through
 * the gateway; tests hand back a mock model.
 */
export class Ai extends Context.Service<
  Ai,
  {
    readonly model: (slug: string) => LanguageModel;
    readonly decisionModel: (slug: string) => Experimental_DecisionModel;
  }
>()("owu/Ai") {}

export type Actor = {
  readonly id: string;
  readonly name: string;
  readonly role: "user" | "admin";
  /** How the caller authenticated: a browser session or an API key (the Owy bot, scripts). */
  readonly via: "session" | "api-key";
};

/** The authenticated caller. Present on every procedure behind `authed`. */
export class CurrentUser extends Context.Service<CurrentUser, Actor>()("owu/CurrentUser") {}

/** The community (and event, when the input names one) a community-scoped procedure acts on. */
export class CommunityScope extends Context.Service<
  CommunityScope,
  { readonly communityId: string; readonly eventId?: string }
>()("owu/CommunityScope") {}

/** Services every request starts with. */
export type AppServices = Database | Realtime | Ai;

const realtimeLive = {
  publish: (channel: string, event: string, payload: unknown) =>
    Effect.promise(() => publishServer(channel, event, payload).catch(() => undefined)),
};

export const aiLive = {
  model: (slug: string): LanguageModel => slug,
  decisionModel: (slug: string): Experimental_DecisionModel => slug,
};

export const liveServices: Context.Context<AppServices> = Context.make(Database, db).pipe(
  Context.add(Realtime, realtimeLive),
  Context.add(Ai, aiLive)
);
