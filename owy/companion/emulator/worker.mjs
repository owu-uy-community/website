import createRuntime from "./owy-runtime.mjs";
import { Session, MAX_TIME, paint } from "./session.mjs";
import { scenarios } from "./fixtures.mjs";
import { poseMotion, shakeMotion } from "./pose.mjs";
let session,
  playing = false,
  speed = 1,
  timer,
  pose = [0, 0, 0],
  lastWall = 0,
  remainder = 0,
  screen,
  posted = { at: 0, mode: "", playing: false, trace: undefined, traced: 0 };
const cache = {};
// The worker paints its own canvas; the page gets the state at most 15 times a second,
// at once when the trace, a cue, a command, the mode or play/pause changes.
function emit(urgent = true) {
  if (screen) paint(session.module, screen, session.size, cache);
  const cues = session.cues.splice(0).map((c) => ({ ...c, pcm: session.pcm(c.kind) }));
  const commands = session.commands.splice(0);
  const tail = session.trace.at(-1);
  const traced = tail !== posted.trace || session.trace.length !== posted.traced;
  const now = performance.now();
  urgent ||= traced || cues.length > 0 || commands.length > 0 || session.mode !== posted.mode || playing !== posted.playing;
  if (!urgent && now - posted.at < 66) return;
  posted = { at: now, mode: session.mode, playing, trace: tail, traced: session.trace.length };
  postMessage(
    {
      type: "state",
      state: session.last,
      ...(traced ? { trace: session.trace.slice(-120) } : {}),
      mode: session.mode,
      duration: session.duration,
      playing,
      cues,
      commands,
    },
    cues.map((c) => c.pcm.buffer)
  );
}
function run() {
  clearTimeout(timer);
  if (!playing) return;
  try {
    const wall = performance.now();
    remainder += Math.min(100, Math.max(0, wall - lastWall)) * speed;
    lastWall = wall;
    const elapsed = Math.floor(remainder);
    remainder -= elapsed;
    session.advance(elapsed);
    if (session.time >= MAX_TIME || (session.mode === "replay" && session.time >= session.duration)) playing = false;
    emit(false);
    if (playing) timer = setTimeout(run, 16);
  } catch (error) {
    playing = false;
    postMessage({ type: "error", message: error.message });
  }
}
self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === "init") {
      const manifest = await (await fetch(new URL("./manifest.json", import.meta.url))).json();
      const module = await createRuntime();
      session = new Session(module, manifest);
      // The page's canvas, transferred: this worker draws what LVGL flushes.
      screen = m.canvas?.getContext("2d");
      if (screen) m.canvas.width = m.canvas.height = session.size;
      postMessage({ type: "ready", manifest, scenarios: scenarios.map(({ events, ...s }) => s) });
      emit();
      return;
    }
    if (!session) throw Error("Runtime is not ready");
    if (m.type === "live") {
      if (m.value) {
        session.beginLive();
        speed = 1;
        playing = true;
        lastWall = performance.now();
        remainder = 0;
        run();
      } else {
        playing = false;
        clearTimeout(timer);
        session.reset();
      }
      emit();
      return;
    }
    if (m.type === "liveVisual") {
      session.liveVisual(m.phase, m.mic, m.speaker);
      emit(false);
      return;
    }
    if (m.type === "liveCue" && session.mode === "live") {
      session.raw(15, [0]);
      session.observe();
      emit();
      return;
    }
    if (m.type === "liveInput" && session.mode === "live") {
      session.liveInput(m.event);
      emit();
      return;
    }
    if (m.type === "liveDevice" && session.mode === "live") {
      session.liveDevice(m.command);
      emit();
      return;
    }
    if (session.mode === "live" && !["pose", "shake"].includes(m.type))
      throw Error("End live voice before using fixture controls.");
    if (m.type === "play") {
      playing = !!m.value;
      lastWall = performance.now();
      remainder = 0;
      run();
      emit();
      return;
    }
    if (m.type === "speed") {
      if (![0.25, 0.5, 1, 2, 4].includes(m.value)) throw Error("Invalid playback speed");
      speed = m.value;
      return;
    }
    if (m.type === "reset") {
      playing = false;
      clearTimeout(timer);
      pose = [0, 0, 0];
      session.reset();
    } else if (m.type === "advance") {
      if (!Number.isInteger(m.ms) || m.ms < 0 || m.ms > 10000) throw Error("Invalid step");
      session.advance(m.ms);
    } else if (m.type === "input") session.input(m.event);
    else if (m.type === "pose") {
      if (
        !Array.isArray(m.angles) ||
        m.angles.length !== 3 ||
        m.angles.some((v) => !Number.isFinite(v) || Math.abs(v) > 90)
      )
        throw Error("Invalid pose");
      if (session.mode === "replay") throw Error("Reset before changing replay inputs");
      session.schedule([
        ...session.pending.filter((e) => e.type !== "imu"),
        ...poseMotion(pose, m.angles, session.time),
      ]);
      pose = m.angles;
    } else if (m.type === "shake") {
      if (session.mode === "replay") throw Error("Reset before changing replay inputs");
      session.schedule([...session.pending, ...shakeMotion(session.time)]);
    } else if (m.type === "scenario") {
      const fixture = scenarios.find((s) => s.id === m.id);
      if (!fixture) throw Error("Unknown scenario");
      session.reset();
      pose = [0, 0, 0];
      session.schedule(fixture.events);
      playing = true;
      lastWall = performance.now();
      remainder = 0;
      run();
    } else if (m.type === "export") {
      postMessage({ type: "export", json: session.export() });
      return;
    } else if (m.type === "import") {
      playing = false;
      clearTimeout(timer);
      session.import(m.json);
      pose = [0, 0, 0];
    } else if (m.type === "seek") {
      playing = false;
      clearTimeout(timer);
      if (!Number.isFinite(m.time) || m.time < 0 || m.time > session.duration) throw Error("Invalid seek");
      session.seek(m.time);
    }
    emit();
  } catch (error) {
    playing = false;
    clearTimeout(timer);
    postMessage({ type: "error", message: error instanceof Error ? error.message : "Runtime error" });
  }
};
