import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import { Effect } from "effect";
import * as z from "zod";

import {
  EffectEventSchema,
  FaceEventSchema,
  RundownSchema,
  StageStateSchema,
  SubmitInputSchema,
  type SubmitInput,
} from "../../owy-stage/scenes";
import { disconnectSpotify, getSpotifyNowPlaying, spotifyStatus } from "../../owy-stage/spotify";
import { pub, staff } from "../base";
import { limiter } from "../ratelimit";
import {
  FireEffectSchema,
  GetInputsSchema,
  GetPulseSchema,
  SaveRundownSchema,
  SetFaceSchema,
  SetNowPlayingSchema,
  SetSceneSchema,
  SpotifyTrackSchema,
  StageInputSchema,
  StageMeetupSchema,
  StagePulseSchema,
  StageSpeakerSchema,
  StageWeatherSchema,
} from "./schemas";
import * as Stage from "./service";

const docs = (summary: string) => openapi({ tags: ["Stage"], summary });

/**
 * Phones at /owy/play. A phone already sends at most one reaction every 350 ms
 * (~29 per 10 s); this only stops floods. ponytail: keyed on the phone's own
 * random id, which a script can rotate — per IP would throttle a whole venue
 * behind one NAT.
 */
const phoneLimit = ratelimit({
  limiter: limiter({ prefix: "owy-play:", maxRequests: 40, window: 10_000 }),
  key: (_options, input: SubmitInput) => input.voter,
});

// The OBS pages read in public; the admin and the companion bridge (API key) write.
export const owyStageRouter = {
  getState: pub
    .meta(docs("What the wall is showing"))
    .output(StageStateSchema)
    .effect(function* () {
      return yield* Stage.getStage();
    }),

  setScene: staff
    .meta(docs("Put a scene on the wall, or edit the one on air"))
    .input(SetSceneSchema)
    .output(StageStateSchema)
    .effect(function* ({ input }) {
      return yield* Stage.setScene(input);
    }),

  getRundown: staff
    .meta(docs("The operator's rundown"))
    .output(RundownSchema)
    .effect(function* () {
      return yield* Stage.getRundown();
    }),

  saveRundown: staff
    .meta(docs("Replace the rundown"))
    .input(SaveRundownSchema)
    .output(RundownSchema)
    .effect(function* ({ input }) {
      return yield* Stage.saveRundown(input.steps);
    }),

  fireEffect: staff
    .meta(docs("A one-shot overlay: confetti, flash, a caption…"))
    .input(FireEffectSchema)
    .output(EffectEventSchema)
    .effect(function* ({ input }) {
      return yield* Stage.echo("effect", input);
    }),

  setFace: staff
    .meta(docs("Owy's face and running transcript, mirrored from a companion"))
    .input(SetFaceSchema)
    .output(FaceEventSchema)
    .effect(function* ({ input }) {
      return yield* Stage.echo("face", input);
    }),

  getPulse: pub
    .meta(docs("Ticket and board counts for the wall (aggregates only)"))
    .input(GetPulseSchema)
    .output(StagePulseSchema)
    .effect(function* ({ input }) {
      return yield* Stage.getPulse(input?.eventId);
    }),

  getMeetups: pub
    .meta(docs("The community's next meetups"))
    .output(z.array(StageMeetupSchema))
    .effect(function* () {
      return yield* Stage.getMeetups();
    }),

  getWeather: pub
    .meta(docs("Montevideo's weather now and for the next hours"))
    .output(StageWeatherSchema.nullable())
    .effect(function* () {
      return yield* Stage.getWeather();
    }),

  getSpeakers: pub
    .meta(docs("Past speakers"))
    .output(z.array(StageSpeakerSchema))
    .effect(function* () {
      return yield* Stage.getSpeakers();
    }),

  submit: pub
    .meta(docs("A phone's answer for the round on air"))
    .input(SubmitInputSchema)
    .use(phoneLimit)
    .output(z.object({ ok: z.boolean(), id: z.string().optional() }))
    .effect(function* ({ input }) {
      return yield* Stage.submitInput(input);
    }),

  inputs: pub
    .meta(docs("Everything phones sent during a round, oldest first"))
    .input(GetInputsSchema)
    .output(z.array(StageInputSchema))
    .effect(function* ({ input }) {
      return yield* Stage.getInputs(input.round);
    }),

  nowPlaying: staff
    .meta(docs("A song recogniser's report; only lands while now-playing is on air"))
    .input(SetNowPlayingSchema)
    .output(z.object({ applied: z.boolean() }))
    .effect(function* ({ input }) {
      return yield* Stage.setNowPlaying(input);
    }),

  getSpotify: pub
    .meta(docs("What the linked Spotify account is playing; null when nothing or unreachable"))
    .output(SpotifyTrackSchema.nullable())
    .effect(function* () {
      return yield* Effect.tryPromise(() => getSpotifyNowPlaying()).pipe(Effect.orElseSucceed(() => null));
    }),

  spotifyStatus: staff
    .meta(docs("Whether Spotify is set up and which account is linked"))
    .output(z.object({ configured: z.boolean(), account: z.string().nullable() }))
    .effect(function* () {
      return yield* Effect.promise(() => spotifyStatus());
    }),

  disconnectSpotify: staff
    .meta(docs("Unlink the Spotify account"))
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* () {
      yield* Effect.promise(() => disconnectSpotify());

      return { ok: true as const };
    }),
};
