"use client";

import type { ComponentType } from "react";

import type { SceneId, SceneProps } from "lib/owy-stage/scenes";

type Loader<K extends SceneId> = () => Promise<ComponentType<SceneProps<K>>>;

/**
 * Where each scene's code lives. Every scene file is its own chunk, so a page
 * only downloads and parses what it shows: the wall loads the scene on air and
 * then the rest while it idles, a monitor the scenes it is about to show, and
 * the desk none at all.
 */
const LOADERS: { [K in SceneId]: Loader<K> } = {
  // Ágiles Uruguay 2026
  "agiles-logo": () => import("./agiles").then((m) => m.AgilesCover),
  "agiles-welcome": () => import("./agiles").then((m) => m.AgilesWelcome),
  "agiles-program": () => import("./agiles").then((m) => m.AgilesProgram),
  "agiles-now": () => import("./agiles").then((m) => m.AgilesNow),
  "agiles-speaker": () => import("./agiles").then((m) => m.AgilesSpeaker),
  "agiles-break": () => import("./agiles").then((m) => m.AgilesBreak),
  "agiles-message": () => import("./agiles").then((m) => m.AgilesMessage),
  "agiles-sponsors": () => import("./agiles").then((m) => m.AgilesSponsors),
  "agiles-social": () => import("./agiles").then((m) => m.AgilesSocial),
  "agiles-closing": () => import("./agiles").then((m) => m.AgilesClosing),
  "agiles-os-intro": () => import("./agiles-openspace").then((m) => m.OsIntro),
  "agiles-os-principles": () => import("./agiles-openspace").then((m) => m.OsPrinciples),
  "agiles-os-marketplace": () => import("./agiles-openspace").then((m) => m.OsMarketplace),
  "agiles-os-board": () => import("./agiles-openspace").then((m) => m.OsBoard),
  "agiles-os-room": () => import("./agiles-openspace").then((m) => m.OsRoom),
  "agiles-os-rounds": () => import("./agiles-openspace").then((m) => m.OsRounds),
  "agiles-os-closing": () => import("./agiles-openspace").then((m) => m.OsClosing),
  "owy-face": () => import("./OwyFace").then((m) => m.default),
  logo: () => import("./core").then((m) => m.Logo),
  opening: () => import("./core").then((m) => m.Opening),
  message: () => import("./core").then((m) => m.Message),
  "talk-intro": () => import("./speakers").then((m) => m.TalkIntro),
  speakers: () => import("./speakers").then((m) => m.Speakers),
  "up-next": () => import("./core").then((m) => m.UpNext),
  sponsors: () => import("./core").then((m) => m.Sponsors),
  countdown: () => import("./core").then((m) => m.CountdownScene),
  agenda: () => import("./more").then((m) => m.Agenda),
  moments: () => import("./more").then((m) => m.Moments),
  "lower-third": () => import("./more").then((m) => m.LowerThird),
  clock: () => import("./more").then((m) => m.Clock),
  closing: () => import("./more").then((m) => m.Closing),
  shapes: () => import("./more").then((m) => m.Shapes),
  team: () => import("./more").then((m) => m.Team),
  launch: () => import("./creative").then((m) => m.Launch),
  terminal: () => import("./creative").then((m) => m.Terminal),
  ideas: () => import("./creative").then((m) => m.Ideas),
  tangram: () => import("./creative").then((m) => m.Tangram),
  kaleidoscope: () => import("./creative").then((m) => m.Kaleidoscope),
  "owy-talks": () => import("./creative").then((m) => m.OwyTalks),
  ticker: () => import("./creative").then((m) => m.Ticker),
  talk: () => import("./creative").then((m) => m.Talk),
  sponsor: () => import("./creative").then((m) => m.Sponsor),
  days: () => import("./creative").then((m) => m.Days),
  program: () => import("./useful").then((m) => m.Program),
  next: () => import("./useful").then((m) => m.Next),
  room: () => import("./useful").then((m) => m.RoomDay),
  "cast-bar": () => import("./useful").then((m) => m.CastBar),
  wifi: () => import("./useful").then((m) => m.Wifi),
  alert: () => import("./useful").then((m) => m.Alert),
  steps: () => import("./useful").then((m) => m.Steps),
  "owy-howto": () => import("./useful").then((m) => m.OwyHowTo),
  social: () => import("./useful").then((m) => m.Social),
  photo: () => import("./useful").then((m) => m.Photo),
  block: () => import("./legacy").then((m) => m.Block),
  cams: () => import("./legacy").then((m) => m.Cams),
  community: () => import("./legacy").then((m) => m.Community),
  silence: () => import("./legacy").then((m) => m.Silence),
  promo: () => import("./legacy").then((m) => m.Promo),
  qr: () => import("./legacy").then((m) => m.Qr),
  after: () => import("./legacy").then((m) => m.After),
  frame: () => import("./legacy").then((m) => m.Frame),
  board: () => import("./extra").then((m) => m.Board),
  "rooms-now": () => import("./extra").then((m) => m.RoomsNow),
  marquee: () => import("./extra").then((m) => m.Marquee),
  until: () => import("./extra").then((m) => m.Until),
  quote: () => import("./extra").then((m) => m.Quote),
  "sponsor-wall": () => import("./extra").then((m) => m.SponsorWall),
  applause: () => import("./extra").then((m) => m.Applause),
  speaker: () => import("./extra").then((m) => m.Speaker),
  numbers: () => import("./extra").then((m) => m.Numbers),
  rain: () => import("./extra").then((m) => m.Rain),
  warp: () => import("./extra").then((m) => m.Warp),
  qa: () => import("./extra").then((m) => m.Questions),
  meetups: () => import("./discover").then((m) => m.Meetups),
  pulse: () => import("./discover").then((m) => m.Pulse),
  principles: () => import("./discover").then((m) => m.Principles),
  "owy-card": () => import("./discover").then((m) => m.OwyCard),
  history: () => import("./discover").then((m) => m.History),
  venue: () => import("./discover").then((m) => m.Venue),
  selfie: () => import("./discover").then((m) => m.Selfie),
  raffle: () => import("./discover").then((m) => m.Raffle),
  welcome: () => import("./discover").then((m) => m.Welcome),
  trivia: () => import("./fun").then((m) => m.Trivia),
  versus: () => import("./fun").then((m) => m.Versus),
  lineup: () => import("./fun").then((m) => m.Lineup),
  "owy-says": () => import("./fun").then((m) => m.OwySays),
  aurora: () => import("./fun").then((m) => m.Aurora),
  dvd: () => import("./fun").then((m) => m.Dvd),
  life: () => import("./fun").then((m) => m.Life),
  "test-card": () => import("./fun").then((m) => m.TestCard),
  conduct: () => import("./fun").then((m) => m.Conduct),
  mosaic: () => import("./fun").then((m) => m.Mosaic),
  plasma: () => import("./gen").then((m) => m.Plasma),
  tunnel: () => import("./gen").then((m) => m.Tunnel),
  fire: () => import("./gen").then((m) => m.Fire),
  metaballs: () => import("./gen").then((m) => m.Metaballs),
  voronoi: () => import("./gen").then((m) => m.Voronoi),
  "reaction-diffusion": () => import("./gen").then((m) => m.ReactionDiffusion),
  julia: () => import("./gen").then((m) => m.Julia),
  "flow-field": () => import("./gen").then((m) => m.FlowField),
  boids: () => import("./gen").then((m) => m.Boids),
  rotozoom: () => import("./gen").then((m) => m.Rotozoom),
  terrain: () => import("./gen2").then((m) => m.Terrain),
  ripples: () => import("./gen2").then((m) => m.Ripples),
  rays: () => import("./gen2").then((m) => m.Rays),
  network: () => import("./gen2").then((m) => m.Network),
  blob: () => import("./gen2").then((m) => m.Blob),
  dragon: () => import("./gen2").then((m) => m.Dragon),
  wfc: () => import("./gen2").then((m) => m.Wfc),
  sand: () => import("./gen2").then((m) => m.Sand),
  fireworks: () => import("./gen2").then((m) => m.Fireworks),
  "particle-text": () => import("./gen2").then((m) => m.ParticleText),
  mystify: () => import("./sims").then((m) => m.Mystify),
  pipes: () => import("./sims").then((m) => m.Pipes),
  "pendulum-wave": () => import("./sims").then((m) => m.PendulumWave),
  "double-pendulum": () => import("./sims").then((m) => m.DoublePendulum),
  automaton: () => import("./sims").then((m) => m.Automaton),
  langton: () => import("./sims").then((m) => m.Langton),
  maze: () => import("./sims").then((m) => m.Maze),
  raycaster: () => import("./sims").then((m) => m.Raycaster),
  sorting: () => import("./sims").then((m) => m.Sorting),
  pong: () => import("./sims").then((m) => m.Pong),
  donut: () => import("./show").then((m) => m.Donut),
  cube: () => import("./show").then((m) => m.Cube),
  neon: () => import("./show").then((m) => m.Neon),
  kinetic: () => import("./show").then((m) => m.Kinetic),
  crawl: () => import("./show").then((m) => m.Crawl),
  credits: () => import("./show").then((m) => m.Credits),
  halftone: () => import("./show").then((m) => m.Halftone),
  equalizer: () => import("./show").then((m) => m.Equalizer),
  "hello-world": () => import("./show").then((m) => m.HelloWorld),
  bsod: () => import("./show").then((m) => m.Bsod),
  poll: () => import("./play").then((m) => m.Poll),
  wheel: () => import("./play").then((m) => m.Wheel),
  coin: () => import("./play").then((m) => m.Coin),
  scoreboard: () => import("./play").then((m) => m.Scoreboard),
  "talk-timer": () => import("./play").then((m) => m.TalkTimer),
  "traffic-light": () => import("./play").then((m) => m.TrafficLight),
  wordle: () => import("./play").then((m) => m.Wordle),
  pipeline: () => import("./play").then((m) => m.Pipeline),
  update: () => import("./play").then((m) => m.Update),
  captcha: () => import("./play").then((m) => m.Captcha),
  rounds: () => import("./service").then((m) => m.Rounds),
  "now-bar": () => import("./service").then((m) => m.NowBar),
  notices: () => import("./service").then((m) => m.Notices),
  changes: () => import("./service").then((m) => m.Changes),
  facilities: () => import("./service").then((m) => m.Facilities),
  emergency: () => import("./service").then((m) => m.Emergency),
  transport: () => import("./service").then((m) => m.Transport),
  food: () => import("./service").then((m) => m.Food),
  feedback: () => import("./service").then((m) => m.Feedback),
  checklist: () => import("./service").then((m) => m.Checklist),
  grid: () => import("./service2").then((m) => m.Grid),
  checkin: () => import("./service2").then((m) => m.Checkin),
  badges: () => import("./service2").then((m) => m.Badges),
  stands: () => import("./service2").then((m) => m.Stands),
  "lost-found": () => import("./service2").then((m) => m.LostFound),
  live: () => import("./service2").then((m) => m.Live),
  weather: () => import("./service2").then((m) => m.Weather),
  timeline: () => import("./service2").then((m) => m.Timeline),
  reminders: () => import("./service2").then((m) => m.Reminders),
  lightning: () => import("./service2").then((m) => m.Lightning),
  hosts: () => import("./more2").then((m) => m.Hosts),
  "room-cards": () => import("./more2").then((m) => m.RoomCards),
  topics: () => import("./more2").then((m) => m.Topics),
  links: () => import("./more2").then((m) => m.Links),
  "wifi-qr": () => import("./more2").then((m) => m.WifiQr),
  alumni: () => import("./more2").then((m) => m.Alumni),
  breathe: () => import("./more2").then((m) => m.Breathe),
  bingo: () => import("./more2").then((m) => m.Bingo),
  "now-playing": () => import("./more2").then((m) => m.NowPlaying),
  departures: () => import("./more2").then((m) => m.Departures),
  networking: () => import("./more2").then((m) => m.Networking),
  icebreaker: () => import("./more2").then((m) => m.Icebreaker),
  "live-poll": () => import("./interactive").then((m) => m.LivePoll),
  "word-cloud": () => import("./interactive").then((m) => m.LiveWordCloud),
  "live-questions": () => import("./interactive").then((m) => m.LiveQuestions),
  reactions: () => import("./interactive").then((m) => m.Reactions),
  quiz: () => import("./interactive").then((m) => m.Quiz),
  rating: () => import("./interactive").then((m) => m.Rating),
  guess: () => import("./interactive").then((m) => m.Guess),
  buzzer: () => import("./interactive").then((m) => m.Buzzer),
  "session-vote": () => import("./interactive").then((m) => m.SessionVote),
  "stand-up": () => import("./interactive").then((m) => m.StandUp),
  corners: () => import("./interactive").then((m) => m.Corners),
  rps: () => import("./interactive").then((m) => m.Rps),
  "human-bingo": () => import("./interactive").then((m) => m.HumanBingo),
  wave: () => import("./interactive").then((m) => m.Wave),
  "line-up": () => import("./interactive").then((m) => m.LineUp),
  scale: () => import("./interactive2").then((m) => m.Scale),
  ranking: () => import("./interactive2").then((m) => m.Ranking),
  wall: () => import("./interactive2").then((m) => m.MessageWall),
  "multi-poll": () => import("./interactive2").then((m) => m.MultiPoll),
  origin: () => import("./interactive2").then((m) => m.Origin),
  presence: () => import("./interactive2").then((m) => m.Presence),
  signatures: () => import("./interactive2").then((m) => m.Signatures),
  pairs: () => import("./interactive2").then((m) => m.Pairs),
  "tap-race": () => import("./interactive2").then((m) => m.TapRace),
  stretch: () => import("./interactive2").then((m) => m.Stretch),
  clap: () => import("./interactive2").then((m) => m.Clap),
  columns: () => import("./interactive2").then((m) => m.Columns),
  pixel: () => import("./interactive3").then((m) => m.Pixel),
  "mood-grid": () => import("./interactive3").then((m) => m.MoodGrid),
  "quiz-race": () => import("./interactive3").then((m) => m.QuizRace),
  "open-mic": () => import("./interactive3").then((m) => m.OpenMic),
  tug: () => import("./interactive3").then((m) => m.Tug),
  "pick-number": () => import("./interactive3").then((m) => m.PickNumber),
  draw: () => import("./interactive3").then((m) => m.Draw),
  typing: () => import("./interactive3").then((m) => m.Typing),
  story: () => import("./interactive3").then((m) => m.Story),
  mirror: () => import("./interactive3").then((m) => m.Mirror),
  "paper-planes": () => import("./interactive3").then((m) => m.PaperPlanes),
  "human-map": () => import("./interactive3").then((m) => m.HumanMap),
  black: () => import("./core").then((m) => m.Black),
};

const loaded = new Map<SceneId, ComponentType<SceneProps<SceneId>>>();
const loading = new Map<SceneId, Promise<void>>();

/** The scene's component, once `loadScene` brought its code. */
export function sceneComponent(id: SceneId) {
  return loaded.get(id) ?? null;
}

/** Brings a scene's code once; a failed load (offline, a deploy) is tried again next time. */
export function loadScene(id: SceneId): Promise<void> {
  if (loaded.has(id)) return Promise.resolve();
  let pending = loading.get(id);
  if (!pending) {
    pending = (LOADERS[id] as Loader<SceneId>)()
      .then((component) => {
        loaded.set(id, component);
      })
      .finally(() => loading.delete(id));
    loading.set(id, pending);
  }

  return pending;
}

/**
 * Every scene, one at a time while the page idles: the wall keeps them all at
 * hand, so no take ever waits for the network (or breaks after a deploy).
 */
export function preloadScenes() {
  const idle = (next: () => void) =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(next) : window.setTimeout(next, 50);
  const queue = (Object.keys(LOADERS) as SceneId[]).filter((id) => !loaded.has(id));
  const step = () => {
    const id = queue.shift();
    if (!id) return;
    loadScene(id)
      .catch(() => undefined)
      .finally(() => idle(step));
  };
  idle(step);
}
