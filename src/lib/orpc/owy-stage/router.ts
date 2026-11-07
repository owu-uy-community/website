import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import { Effect } from "effect";
import * as z from "zod";

import {
  EffectEventSchema,
  FaceEventSchema,
  RundownSchema,
  SpotlightSchema,
  StageStateSchema,
  SubmitInputSchema,
  type SubmitInput,
} from "../../owy-stage/scenes";
import { disconnectSpotify, getSpotifyNowPlaying, spotifyStatus } from "../../owy-stage/spotify";
import { platform, pub } from "../base";
import { loadNote } from "../tracks/service";
import { limiter } from "../ratelimit";
import {
  AutopilotSchema,
  DeskWireSchema,
  FireEffectSchema,
  FirePresetResultSchema,
  FirePresetSchema,
  GetInputsSchema,
  GetPulseSchema,
  ModerateSchema,
  ModerationEventSchema,
  SaveDeskSchema,
  SaveRundownSchema,
  SetFaceSchema,
  SetNowPlayingSchema,
  SetSceneSchema,
  SpotifyTrackSchema,
  SpotlightInputSchema,
  StageCommunitySchema,
  StageInputSchema,
  StageMeetupSchema,
  StagePulseSchema,
  StageSpeakerSchema,
  StageWeatherSchema,
  SeatStatusSchema,
  TakeResultSchema,
  TakeSchema,
  TalkCommandSchema,
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

  setScene: platform("stage:operate")
    .meta(docs("Put a scene on the wall, or edit the one on air"))
    .input(SetSceneSchema)
    .output(StageStateSchema)
    .effect(function* ({ input }) {
      return yield* Stage.setScene(input);
    }),

  getRundown: platform("stage:read")
    .meta(docs("The operator's rundown"))
    .output(RundownSchema)
    .effect(function* () {
      return yield* Stage.getRundown();
    }),

  saveRundown: platform("stage:operate")
    .meta(docs("Replace the rundown"))
    .input(SaveRundownSchema)
    .output(RundownSchema)
    .effect(function* ({ input }) {
      return yield* Stage.saveRundown(input.steps);
    }),

  getDesk: platform("stage:read")
    .meta(docs("The operator's desk: the preview, the queue behind it and the presets"))
    .output(DeskWireSchema)
    .effect(function* () {
      return yield* Stage.getDesk();
    }),

  saveDesk: platform("stage:operate")
    .meta(docs("Replace the desk"))
    .input(SaveDeskSchema)
    .output(DeskWireSchema)
    .effect(function* ({ input }) {
      return yield* Stage.saveDesk(input.desk);
    }),

  take: platform("stage:operate")
    .meta(docs("TAKE or CUT: the preview goes on air and the queue moves up (or the scene that left comes back)"))
    .input(TakeSchema)
    .output(TakeResultSchema)
    .effect(function* ({ input }) {
      return yield* Stage.take(input.step, input.transition);
    }),

  firePreset: platform("stage:fire-preset")
    .meta(docs("A preset, by its id or its number on the desk: into preview (TAKE sends it) or straight on air"))
    .input(FirePresetSchema)
    .output(FirePresetResultSchema)
    .effect(function* ({ input }) {
      return yield* Stage.firePreset(input.preset, input.to);
    }),

  getAutopilot: platform("stage:read")
    .meta(docs("Whether new talks bring the wall to «Owy y la grilla» on their own"))
    .output(AutopilotSchema)
    .effect(function* () {
      return yield* Stage.getAutopilot();
    }),

  setAutopilot: platform("stage:operate")
    .meta(docs("Switch the autopilot: new talks bring the wall to «Owy y la grilla» and up as a spotlight"))
    .input(AutopilotSchema)
    .output(AutopilotSchema)
    .effect(function* ({ input }) {
      return yield* Stage.setAutopilot(input.on);
    }),

  spotlight: platform("stage:operate")
    .meta(docs("Put a talk up big on «Owy y la grilla» (bringing that scene up), then into its cell"))
    .input(SpotlightInputSchema)
    .output(SpotlightSchema)
    .effect(function* ({ input }) {
      return yield* Stage.spotlightTalk(yield* loadNote(input.trackId));
    }),

  fireEffect: platform("stage:operate")
    .meta(docs("A one-shot overlay: confetti, flash, a caption…"))
    .input(FireEffectSchema)
    .output(EffectEventSchema)
    .effect(function* ({ input }) {
      return yield* Stage.echo("effect", input);
    }),

  setFace: platform("stage:operate")
    .meta(docs("Owy's face, running transcript, feeling and the card it just placed, mirrored from a companion"))
    .input(SetFaceSchema)
    .output(FaceEventSchema)
    .effect(function* ({ input }) {
      return yield* Stage.setFace(input);
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

  getCommunities: pub
    .meta(docs("The communities in OWU's public directory"))
    .output(z.array(StageCommunitySchema))
    .effect(function* () {
      return yield* Stage.getCommunities();
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

  talkCommand: platform("stage:operate")
    .meta(docs("«Owy, en vivo»: a command from the presenter's phone for the Mac seat that drives Owy"))
    .input(TalkCommandSchema)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Stage.talkCommand(input);
    }),

  talkStatus: platform("stage:operate")
    .meta(docs("«Owy, en vivo»: the Mac seat's heartbeat (attached device, voice tier, last turn)"))
    .input(SeatStatusSchema)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Stage.talkStatus(input);
    }),

  moderate: platform("stage:operate")
    .meta(docs("Hide, pin or mark answered a question from the phones"))
    .input(ModerateSchema)
    .output(ModerationEventSchema)
    .effect(function* ({ input }) {
      return yield* Stage.moderate(input);
    }),

  nowPlaying: platform("stage:read")
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

  spotifyStatus: platform("stage:read")
    .meta(docs("Whether Spotify is set up and which account is linked"))
    .output(z.object({ configured: z.boolean(), account: z.string().nullable() }))
    .effect(function* () {
      return yield* Effect.promise(() => spotifyStatus());
    }),

  disconnectSpotify: platform("stage:operate")
    .meta(docs("Unlink the Spotify account"))
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* () {
      yield* Effect.promise(() => disconnectSpotify());

      return { ok: true as const };
    }),
};
