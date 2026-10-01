/**
 * A fake OBS for developing the OBS page without OBS: speaks enough
 * obs-websocket v5 (no auth) for /admin/screen — scenes, studio mode,
 * transitions, audio inputs with meters, stream/record, screenshots (a solid
 * colour per scene), request batches.
 *
 *   node scripts/mock-obs.mjs            # ws://localhost:4455
 *   MOCK_OBS_PORT=4466 node scripts/mock-obs.mjs
 *
 * Type a scene name + Enter in its terminal to simulate someone clicking in
 * OBS itself (fires CurrentProgramSceneChanged).
 */
import { createInterface } from "node:readline";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_OBS_PORT ?? 4455);

const state = {
  scenes: [
    "Intro",
    "Speaker + slides",
    "Speaker full",
    "Slides full",
    "Open space board",
    "Sponsors",
    "Break",
    "(hidden) Camera check",
    "Outro",
  ],
  program: "Intro",
  preview: "Speaker + slides",
  studioMode: true,
  transitions: ["Cut", "Fade", "Swipe", "Stinger"],
  transition: "Fade",
  transitionMs: 300,
  inputs: [
    { inputName: "Mic escenario", inputKind: "coreaudio_input_capture", muted: false, db: -6 },
    { inputName: "Desktop Audio", inputKind: "coreaudio_output_capture", muted: true, db: -12 },
    { inputName: "Video sponsors", inputKind: "ffmpeg_source", muted: false, db: 0 },
    { inputName: "Slides browser", inputKind: "browser_source", audio: false },
  ],
  streaming: false,
  streamStartedAt: 0,
  recording: false,
  recordStartedAt: 0,
};

const clients = new Set();
let nextClientId = 0;
const stamp = () => new Date().toISOString().slice(11, 23);
const log = (...args) => console.log(stamp(), ...args);

function send(ws, op, d) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ op, d }));
}

function emit(eventType, eventData = {}) {
  for (const ws of clients) send(ws, 5, { eventType, eventIntent: 1, eventData });
  if (eventType !== "InputVolumeMeters") log(`  ⇢ ${eventType}`, JSON.stringify(eventData));
}

function sceneList() {
  return state.scenes.map((sceneName, i) => ({
    sceneName,
    sceneIndex: state.scenes.length - 1 - i,
    sceneUuid: `uuid-${i}`,
  }));
}

function setProgram(sceneName) {
  if (!state.scenes.includes(sceneName)) throw { code: 600, comment: `No scene named ${sceneName}` };
  const previous = state.program;
  state.program = sceneName;
  if (state.studioMode) {
    // OBS swaps: the old program becomes the preview.
    state.preview = previous;
    emit("CurrentPreviewSceneChanged", { sceneName: state.preview, sceneUuid: "" });
  }
  emit("CurrentProgramSceneChanged", { sceneName, sceneUuid: "" });
}

function transition(durationMs) {
  emit("SceneTransitionStarted", { transitionName: state.transition, transitionUuid: "" });
  setTimeout(() => {
    setProgram(state.preview);
    emit("SceneTransitionEnded", { transitionName: state.transition, transitionUuid: "" });
  }, durationMs);
}

// A 1×1 PNG of a colour per scene, scaled by the browser — enough to see monitors update.
function png(sceneName) {
  const hue = [...sceneName].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const [r, g, b] = hsl(hue, 0.6, 0.45);
  const raw = Buffer.from([0, r, g, b]);
  const chunks = [
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
    chunk("IDAT", deflateStore(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ];

  return `data:image/png;base64,${Buffer.concat(chunks).toString("base64")}`;
}

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));

  return [f(0), f(8), f(4)];
}

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));

  return Buffer.concat([len, typed, crc]);
}

function adler32(buf) {
  let a = 1;
  let b = 0;
  for (const byte of buf) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }

  return ((b << 16) | a) >>> 0;
}

/** zlib stream with one stored (uncompressed) deflate block. */
function deflateStore(raw) {
  const header = Buffer.from([0x78, 0x01]);
  const block = Buffer.alloc(5);
  block[0] = 1;
  block.writeUInt16LE(raw.length, 1);
  block.writeUInt16LE(~raw.length & 0xffff, 3);
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(adler32(raw));

  return Buffer.concat([header, block, raw, adler]);
}

function audioInput(name) {
  const input = state.inputs.find((i) => i.inputName === name);
  if (!input) throw { code: 600, comment: `No input named ${name}` };
  if (input.audio === false) throw { code: 600, comment: `Input ${name} has no audio` };

  return input;
}

const handlers = {
  GetVersion: () => ({
    obsVersion: "31.0.0",
    obsWebSocketVersion: "5.5.0",
    rpcVersion: 1,
    availableRequests: [],
    supportedImageFormats: ["png", "jpg"],
    platform: "mock",
    platformDescription: "mock-obs",
  }),
  GetStats: () => ({
    cpuUsage: 12.5,
    memoryUsage: 900,
    availableDiskSpace: 100000,
    activeFps: 60,
    averageFrameRenderTime: 2.1,
    renderSkippedFrames: 0,
    renderTotalFrames: 100000,
    outputSkippedFrames: state.streaming ? 3 : 0,
    outputTotalFrames: state.streaming ? 5000 : 0,
  }),
  GetSceneList: () => ({
    currentProgramSceneName: state.program,
    currentProgramSceneUuid: "",
    currentPreviewSceneName: state.studioMode ? state.preview : null,
    currentPreviewSceneUuid: "",
    scenes: sceneList(),
  }),
  GetCurrentProgramScene: () => ({ currentProgramSceneName: state.program, sceneName: state.program, sceneUuid: "" }),
  GetCurrentPreviewScene: () => {
    if (!state.studioMode) throw { code: 506, comment: "Studio mode is not enabled" };

    return { currentPreviewSceneName: state.preview, sceneName: state.preview, sceneUuid: "" };
  },
  SetCurrentProgramScene: ({ sceneName }) => {
    setProgram(sceneName);
  },
  SetCurrentPreviewScene: ({ sceneName }) => {
    if (!state.studioMode) throw { code: 506, comment: "Studio mode is not enabled" };
    if (!state.scenes.includes(sceneName)) throw { code: 600, comment: `No scene named ${sceneName}` };
    state.preview = sceneName;
    emit("CurrentPreviewSceneChanged", { sceneName, sceneUuid: "" });
  },
  GetStudioModeEnabled: () => ({ studioModeEnabled: state.studioMode }),
  SetStudioModeEnabled: ({ studioModeEnabled }) => {
    state.studioMode = studioModeEnabled;
    if (studioModeEnabled) state.preview = state.preview || state.program;
    emit("StudioModeStateChanged", { studioModeEnabled });
  },
  TriggerStudioModeTransition: () => {
    if (!state.studioMode) throw { code: 506, comment: "Studio mode is not enabled" };
    transition(state.transition === "Cut" ? 0 : state.transitionMs);
  },
  GetSceneTransitionList: () => ({
    currentSceneTransitionName: state.transition,
    currentSceneTransitionUuid: "",
    currentSceneTransitionKind: "fade_transition",
    transitions: state.transitions.map((transitionName) => ({
      transitionName,
      transitionUuid: "",
      transitionKind: "x",
      transitionFixed: transitionName === "Cut",
      transitionConfigurable: false,
    })),
  }),
  GetCurrentSceneTransition: () => ({
    transitionName: state.transition,
    transitionUuid: "",
    transitionKind: "x",
    transitionFixed: state.transition === "Cut",
    transitionDuration: state.transitionMs,
    transitionConfigurable: false,
    transitionSettings: null,
  }),
  SetCurrentSceneTransition: ({ transitionName }) => {
    if (!state.transitions.includes(transitionName))
      throw { code: 600, comment: `No transition named ${transitionName}` };
    state.transition = transitionName;
    emit("CurrentSceneTransitionChanged", { transitionName, transitionUuid: "" });
  },
  SetCurrentSceneTransitionDuration: ({ transitionDuration }) => {
    state.transitionMs = transitionDuration;
    emit("CurrentSceneTransitionDurationChanged", { transitionDuration });
  },
  GetInputList: () => ({
    inputs: state.inputs.map((i) => ({
      inputName: i.inputName,
      inputKind: i.inputKind,
      unversionedInputKind: i.inputKind,
      inputUuid: "",
    })),
  }),
  GetInputMute: ({ inputName }) => ({ inputMuted: audioInput(inputName).muted }),
  SetInputMute: ({ inputName, inputMuted }) => {
    audioInput(inputName).muted = inputMuted;
    emit("InputMuteStateChanged", { inputName, inputUuid: "", inputMuted });
  },
  ToggleInputMute: ({ inputName }) => {
    const input = audioInput(inputName);
    input.muted = !input.muted;
    emit("InputMuteStateChanged", { inputName, inputUuid: "", inputMuted: input.muted });

    return { inputMuted: input.muted };
  },
  GetInputVolume: ({ inputName }) => {
    const input = audioInput(inputName);

    return { inputVolumeMul: 10 ** (input.db / 20), inputVolumeDb: input.db };
  },
  SetInputVolume: ({ inputName, inputVolumeDb }) => {
    const input = audioInput(inputName);
    input.db = inputVolumeDb;
    emit("InputVolumeChanged", { inputName, inputUuid: "", inputVolumeMul: 10 ** (inputVolumeDb / 20), inputVolumeDb });
  },
  GetSourceScreenshot: ({ sourceName }) => {
    if (!state.scenes.includes(sourceName)) throw { code: 600, comment: `No source named ${sourceName}` };

    return { imageData: png(sourceName) };
  },
  GetStreamStatus: () => ({
    outputActive: state.streaming,
    outputReconnecting: false,
    outputTimecode: "00:00:00",
    outputDuration: state.streaming ? Date.now() - state.streamStartedAt : 0,
    outputCongestion: 0,
    outputBytes: 0,
    outputSkippedFrames: state.streaming ? 3 : 0,
    outputTotalFrames: state.streaming ? 5000 : 0,
  }),
  GetRecordStatus: () => ({
    outputActive: state.recording,
    outputPaused: false,
    outputTimecode: "00:00:00",
    outputDuration: state.recording ? Date.now() - state.recordStartedAt : 0,
    outputBytes: 0,
  }),
  StartStream: () => setOutput("stream", true),
  StopStream: () => setOutput("stream", false),
  ToggleStream: () => ({ outputActive: setOutput("stream", !state.streaming) }),
  StartRecord: () => setOutput("record", true),
  StopRecord: () => setOutput("record", false),
  ToggleRecord: () => ({ outputActive: setOutput("record", !state.recording) }),
};

function setOutput(kind, active) {
  const key = kind === "stream" ? "streaming" : "recording";
  const startedKey = kind === "stream" ? "streamStartedAt" : "recordStartedAt";
  const event = kind === "stream" ? "StreamStateChanged" : "RecordStateChanged";
  emit(event, {
    outputActive: active,
    outputState: active ? "OBS_WEBSOCKET_OUTPUT_STARTING" : "OBS_WEBSOCKET_OUTPUT_STOPPING",
  });
  setTimeout(() => {
    state[key] = active;
    state[startedKey] = active ? Date.now() : 0;
    emit(event, {
      outputActive: active,
      outputState: active ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED",
      ...(kind === "record" ? { outputPath: null } : {}),
    });
  }, 400);

  return active;
}

function run(requestType, requestData = {}) {
  const handler = handlers[requestType];
  if (!handler) return { requestStatus: { result: false, code: 204, comment: `Unknown request ${requestType}` } };
  try {
    const responseData = handler(requestData) ?? undefined;

    return { requestStatus: { result: true, code: 100 }, ...(responseData === undefined ? {} : { responseData }) };
  } catch (error) {
    return { requestStatus: { result: false, code: error.code ?? 500, comment: error.comment ?? String(error) } };
  }
}

const wss = new WebSocketServer({
  port: PORT,
  handleProtocols: (protocols) => (protocols.has("obswebsocket.json") ? "obswebsocket.json" : false),
});

wss.on("connection", (ws) => {
  const id = ++nextClientId;
  log(`client #${id} connected`);
  send(ws, 0, { obsWebSocketVersion: "5.5.0", rpcVersion: 1 });

  ws.on("message", (data) => {
    let frame;
    try {
      frame = JSON.parse(String(data));
    } catch {
      return;
    }
    const { op, d } = frame;
    if (op === 1) {
      clients.add(ws);
      send(ws, 2, { negotiatedRpcVersion: 1 });

      return;
    }
    if (op === 3) {
      send(ws, 2, { negotiatedRpcVersion: 1 });

      return;
    }
    if (op === 6) {
      if (d.requestType !== "GetSourceScreenshot")
        log(`#${id} ← ${d.requestType}`, JSON.stringify(d.requestData ?? {}));
      send(ws, 7, { requestType: d.requestType, requestId: d.requestId, ...run(d.requestType, d.requestData) });

      return;
    }
    if (op === 8) {
      log(`#${id} ← batch ${d.requests.map((r) => r.requestType).join(",")}`);
      const results = d.requests.map((request) => ({
        requestType: request.requestType,
        requestId: request.requestId,
        ...run(request.requestType, request.requestData),
      }));
      send(ws, 9, { requestId: d.requestId, results });
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    log(`client #${id} disconnected`);
  });
});

// Meters: a wobble per unmuted audio input, 20 Hz like OBS.
let phase = 0;
setInterval(() => {
  if (clients.size === 0) return;
  phase += 0.15;
  const inputs = state.inputs
    .filter((input) => input.audio !== false)
    .map((input, index) => {
      const peak = input.muted ? 0 : Math.max(0, 0.15 + 0.5 * Math.abs(Math.sin(phase + index)) + Math.random() * 0.2);

      return { inputName: input.inputName, inputUuid: "", inputLevelsMul: [[peak * 0.8, peak, peak]] };
    });
  emit("InputVolumeMeters", { inputs });
}, 50);

createInterface({ input: process.stdin }).on("line", (line) => {
  const name = line.trim();
  if (state.scenes.includes(name)) setProgram(name);
  else if (name) console.log(`no scene "${name}"; scenes: ${state.scenes.join(", ")}`);
});

console.log(
  `mock OBS listening on ws://localhost:${PORT} (scenes: ${state.scenes.length}, studio mode ${state.studioMode ? "on" : "off"})`
);
