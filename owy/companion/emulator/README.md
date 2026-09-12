# Companion lab

An implemented debugger with local fixtures and opt-in live voice at **`/admin/companion`** in the web app.
The route requires the existing admin session. React supplies the workbench;
the round 466×466 viewport displays RGB565 pixels from real LVGL 9.5.0 in a
Web Worker, using the firmware's C++ face/motion code and generated scene/fonts.

It shares the firmware's renderer, not its hardware lifecycle: timing, audio
and the physical panel still differ, so a pass here is not a substitute for
testing on the board.

## Open it

From the repository root, with the site's normal dependencies and environment:

```sh
pnpm dev
```

Sign in as an admin and open **Companion lab** in the admin navigation.
Prebuilt runtime assets are included; opening the workbench needs no Emscripten,
device, Gemini key, microphone permission, or production API key.

For development without the site's database/auth environment, the same React
workbench has a deliberately separate **loopback-only fixture preview**:

```sh
pnpm companion:emulator:preview
```

Open `http://127.0.0.1:3311`. By default, voice issuance is disabled. The preview
does not connect to physical hardware or bypass website authentication. It serves the
workbench and fixed static assets. Restart it after React/CSS edits. Use the repository's installed
pnpm version; `node owy/companion/emulator/preview.mjs` is equivalent once
dependencies are installed.

## Speak with Owy

Use **Talk to Owy → consent checkbox → Start talking**, then allow the browser's
microphone prompt. The browser is now a **virtual device connected to the existing
Node bridge**, not a standalone Gemini demo:

`browser mic → BrowserDevice → DeviceSession → NodeRealtimeSession → voice provider`

The gadget uses the same `DeviceSession`, model configuration, prompt/knowledge
bundle, tool definitions/execution, VoiceTurn and PacedSpeaker. The bridge debugger
shows model, voice, prompt fingerprint, effective permissions and each tool result
status. Screen/card/QR and volume tools target the virtual device, never the gadget.
As on the gadget, tools reuse Owy's modules **outside Eve**; this is not a new Eve
durable-agent integration. Missing `OWY_API_KEY` is surfaced, not replaced by fake data.

- Speak normally; pauses end a turn. **I'm done** is an explicit fallback for
  noisy rooms. Replies play through the browser and animate the shared C++ face.
- Follow-up listening opens after audible playback finishes. No wake word is
  needed. After 8 seconds without detected speech, tracks are stopped; **Resume**
  reacquires the microphone for a **fresh context**, matching the gadget's silent-idle
  reset. Consecutive follow-up turns before that deadline retain context.
- **Interrupt & speak** stops queued playback and lets your speech interrupt
  the response. The mic is gated during ordinary playback to reduce echo; this
  is button-driven interruption, not always-listening full duplex.
- **Mute** releases microphone tracks and stops playback. **End**, tab hiding,
  navigation, disconnect, and the 5-minute cap close the voice session and audio
  resources. A new session needs another Start, not an automatic reconnect.
- Volume, continuous mode and privacy are linked to the on-screen device settings.
  Touch/BOOT start or cancel, motion/gestures remain interactive, and calibration or
  privacy releases the actual browser microphone. Listening cues use shared PCM.

Start the existing bridge (from `owy/`; its existing provider/API credentials stay
there). It can also run without a physical device by leaving `COMPANION_DEVICES` empty:

```sh
COMPANION_WEB_BRIDGE=1 pnpm companion:dev
```

The additional transport binds only `127.0.0.1:3312`. In the same repository, the
local preview discovers a per-boot, mode-0600 server-only capability in
`owy/companion/.eve/web-bridge.json`. That file is ignored by git and never served.
The preview no longer needs a Gemini key.

For the authenticated Next route, configure `COMPANION_BRIDGE_URL` (internal HTTP
loopback or HTTPS) and `COMPANION_BRIDGE_SECRET` (at least 32 characters, same value
on the bridge). Set the bridge's `COMPANION_WEB_ORIGINS` to the exact comma-separated
webapp origins. For remote deployment, terminate TLS in a reverse proxy and set
`COMPANION_BRIDGE_PUBLIC_URL=wss://your-bridge-host/voice`. Proxy only `/voice`
publicly; keep `/sessions` private. None of these secrets are `NEXT_PUBLIC_` values.
The bridge process must run separately from serverless Next request handlers.

`POST /api/companion/voice-session` requires site-admin auth, exact origin and JSON.
It brokers a **single-use**, origin-bound, 60-second-to-connect capability, never a
provider token. The browser authenticates in its first WS message, not a URL query.
The bridge enforces session/connection/PCM/control limits, heartbeat and five-minute
expiry. Model, tools, provider credentials, staff and write scopes cannot be changed
through browser WS commands. The old direct-provider token route has been removed.

Event-data access defaults to read-only. The authenticated administrator can explicitly
enable real changes, staff context and marketplace access **before** starting a new
session. These scopes are frozen server-side. The fixture PIN never elevates them.
Shared tool policies, staff checks and proposal cooldowns still apply. Real actions
are real actions, not simulations; use a staging `OWU_API_URL` for mutation tests.

For the explicitly local preview, run from the repository root:

```sh
COMPANION_WEB_VOICE=1 pnpm companion:emulator:preview
```

It remains bound to `127.0.0.1:3311`, rejects foreign Host/Origin requests, and
does not replace website authentication. Do not expose this development server
through a public tunnel. Distributed production deployments should add a shared
quota/billing limit; the per-process limiter is a retry safeguard, not a global
spending cap.

Live mode is deliberately non-replayable: no audio, tokens or transcript are
written to application storage. The bridge suppresses conversation/tool payload
logs for browser sessions. The worker receives phase/envelopes and live screen
commands; it never receives audio or credentials. Screen data, transcript and bounded
tool diagnostics remain in page memory and are cleared on reload/reset. Google
receives audio under its service data policies; explicitly authorized actions may
persist event changes. Replay, synthetic voice and fault injection are disabled
during live voice, while device touch/motion/settings remain usable.

The audio path uses an AudioWorklet, streaming 44.1/48 kHz→16 kHz PCM conversion,
bounded network buffering, the bridge's 24→16 kHz resampler and paced 16 kHz reply
playback, run-tagged PCM to reject stale frames, an output queue cap, and
timeouts. HTTPS or localhost is required. Browser/microphone support and noisy
room accuracy still need hands-on validation on target devices.

```sh
pnpm companion:voice:test
# Also from owy/: pnpm companion:test
```

## Try these first

1. **Find my center**: real MotionTracker calibration, progress, and success.
   **Too wiggly to calibrate** demonstrates rejection and timeout.
2. **Keep the conversation going**: three fixture replies followed by silence
   and wake-word standby, through the actual bridge VoiceTurn/PacedSpeaker.
3. **A burst on the wire**: 700 ms of queued transport followed by a burst into
   the modeled 32 KiB receive buffer; inspect byte counts and STOPPED ordering.
4. Drag on the face, hold to open its menu, or use equivalent Input buttons.
   Roll/pitch/yaw produce consistent body-frame gravity and gyro samples; shake
   goes through the real gesture detector rather than directly setting a face.
5. Pause, step 16 ms, export, then import and scrub the version-bound replay.

Inputs and faults are recorded with virtual timestamps and a fixed seed. Replay
is read-only, bounded to 10 minutes / 20,000 events / 2 MiB, and rejects mismatched
runtime versions. Export is a local download, not an upload. Do not put sensitive
information in imported text fixtures or redistribute it unintentionally.

Sound is opt-in. Listening, playful and diagnostic PCM are generated by the
same C++ cue code as the device. Speech transport deliberately uses silence,
not fake TTS. Envelope sliders exercise the shared listening/mouth animation
without recognition. A browser output device resamples the 16 kHz samples.
Hidden tabs pause simulation and suspend audio; resume explicitly.

The fixture PIN is **1234**, never the physical PIN. Settings and successful
calibration survive the modeled PWR cycle; Reset/browser reload restores fixture
defaults. Browser controls never alter the physical device or event data.

## Rebuild the runtime

Pinned versions: ESPHome **2026.8.2**, LVGL **9.5.0**, Emscripten **6.0.9**.
Root dependencies include esbuild; `owy/` dependencies supply the real bridge
and esphome-client's protocol constants. Install both dependency sets first.

The first physical ESPHome compile populates the LVGL managed component under
`owy/companion/.eve/esphome-build/owy-companion/managed_components/lvgl__lvgl`.
That compiler configuration requires local, ignored `firmware/secrets.yaml`.
No such file or generated `main.cpp` belongs in public assets.

Install the pinned SDK once in the ignored build directory:

```sh
git clone https://github.com/emscripten-core/emsdk.git owy/companion/.eve/emsdk
owy/companion/.eve/emsdk/emsdk install 6.0.9
owy/companion/.eve/emsdk/emsdk activate 6.0.9
```

Then run from the repository root:

```sh
pnpm companion:emulator:generate
pnpm companion:emulator:build
pnpm companion:emulator:test
pnpm exec tsc --noEmit
```

`generate` first runs ESPHome's `compile --only-generate`, then exports only an
allowlisted scene-construction block and literal font bitmaps. Unknown wrappers
or page counts fail closed. Compiler output stays local. It does not flash.
`build` checks source hashes and tool versions, compiles LVGL incrementally,
links the shared C++ runtime, and bundles the production bridge with virtual
timers. `EMCC`, `EMXX`, `EM_CONFIG`, and `LVGL_DIR` can point to other local
installations of the **same pinned versions**.

Commit generated scene files and `public/companion-runtime/` together with the
source change. Tests verify provenance: stale firmware, runtime, bridge, worker,
or WASM assets fail. Next's build does not invoke an ESP32/SDK build implicitly.
Use `companion:emulator:test` as a CI gate before deployment.

## Implementation map

- `generate-scene.mjs`, `generated/`: ESPHome-produced LVGL scene/font export.
- `runtime.cpp`: shared C++ model/renderer plus **modeled device HAL**.
- `bridge-adapter.ts`: actual production VoiceTurn/PacedSpeaker, virtual clock,
  fixture transport; `bridge.mjs` is generated and must not be edited by hand.
- `session.mjs`, `worker.mjs`: bounded input protocol, virtual clock, replay.
- `pose.mjs`, `fixtures.mjs`: physically consistent input fixtures / 14 scenarios.
- `tests.mjs`, `provenance.mjs`: executable WASM regressions and build integrity.
- `src/components/Companion/`: shared admin/preview React workbench.

Do not copy a new face animation into React or add production tool calls to the
fixture worker. A future hardware/tool mode needs server-side authorization, explicit
consent, privacy indicators, redaction, cancellation and its own acceptance tests.

## Distribution

See [third-party notices](THIRD-PARTY-NOTICES.txt). LVGL and its QR library are
MIT; Montserrat is OFL. ESPHome's **C++ runtime is GPLv3, not the Python
generator's MIT license**; the font adapter retains that notice. External
distribution needs corresponding-source availability and a license review,
including the existing Organic Stencil asset's permissions. No public deployment
or publication was performed as part of this local implementation.

Build references: [LVGL browser integration](https://lvgl.io/docs/open/9.5/integration/pc/browser.html),
[Emscripten SDK installation](https://emscripten.org/docs/getting_started/downloads.html).
