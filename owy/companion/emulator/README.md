# Companion face runtime

Owy's face for the web: the firmware's own `Companion` model and `FaceRenderer`
(`owy/companion/firmware/companion_model.h`, `companion_lvgl.h`) over the LVGL
scene ESPHome generates from `owy-knob.yaml`, compiled to WebAssembly. The video
wall and the talk deck draw it (`src/components/OwyStage/Face.tsx` loads
`public/companion-runtime/face.mjs`), so the big Owy makes the knob's exact faces.

`face.mjs` (a worker drawing into a transferred `OffscreenCanvas`) takes what the bridge
tells the knob, in one of two modes chosen at `init`:

- **Face-only** (the default): the face alone, at any size. No gestures, pages, sleep or hints.
- **Device** (`device: true`): a twin of the knob's whole 360 px screen for everything the
  bridge can tell it — the hint under the face and the pausa badge (`companion.yaml`), the
  `face_state` lifecycle with `page_hold` and the 12 s return to the face (`face.yaml`,
  `controls.yaml`), the answer view (mini face, « heard » pill, reply, rim) and the card,
  QR and text pages (`boards/knob18.yaml`). The boot logo, the brightness overlay and the
  tap catcher stay hidden: the page handles clicks. The canvas is always 360 px (the page
  scales it with CSS), and the mouth never babbles: the knob's only moves with the bridge's frames.

`public/companion-runtime/face.png` is the knob's idle face as the worker first paints it
(face-only, 360 px, 2 s in); `Face.tsx` shows it until then.

## Worker messages

| Message | Fields | |
| --- | --- | --- |
| `init` | `canvas, size, board, fps, lag, device` | `lag`: ms the picture runs late (positive = act earlier); device mode ignores `size` and `board` |
| `state` | `state` | `idle · listening · thinking · speaking · happy · error · offline` (the knob's `face_state`) |
| `mood` | `mood` | a raw `owy::Mood` 0..11 |
| `level` | `level` | the Mac mic 0..100 (`mic_level`), only while the state is `listening`; 300 ms without one drops it to 0 |
| `privacy` | `on` | pausa (`mic_privacy`): Owy's privacy face over everything |
| `reduced` | `on` | reduced motion |
| `express` | `name, strength, at` | `at`: epoch ms when the sentence becomes audible |
| `smile`, `mouth` | `frames, at` | a pet's smile; the bridge's lip track |
| `caption` | `text` | device only: `show_caption` |
| `heard` | `text` | device only: `show_heard` (`« text »`; empty clears it) |
| `card` | `title, speaker?, room?, timeSlot?` | device only: `show_card` |
| `text` | `body` | device only: `show_text` |
| `qr` | `url, caption?` | device only: `show_qr` (no caption: «La grilla, en tu celu») |
| `stats` | | replies `{type: "stats", frames, average, worst, snapshot}` (`owy_snapshot`, with the page) |

It posts `{type: "frame"}` after its first paint and `{type: "error"}` if it cannot run.
Underneath, `owy_input` takes typed inputs (18 mood, 21 smile, 33 phase and levels,
37 expression, 39 mouth track, 40 pausa, 41 reduced motion, 42–46 caption, heard, card,
text, QR); a multi-field text is joined with U+001F, and the runtime bounds every string.

## Rebuild

Needed after a change to the face model, the renderer or the LVGL pages. Three
steps, from the repository root (Emscripten 6.0.9 under `owy/companion/.eve/emsdk`,
LVGL 9.5.0 from an ESPHome build of the knob):

```sh
pnpm companion:emulator:generate   # esphome compile --only-generate owy-knob.yaml → generated/ (needs firmware/secrets.yaml)
pnpm companion:emulator:build      # LVGL + runtime.cpp → public/companion-runtime/owy-runtime.{mjs,wasm} + manifest
pnpm companion:emulator:test       # provenance, the face, the knob's twin and the worker's protocol
```

Without `secrets.yaml`, generate from a build made elsewhere:
`OWY_SCENE_SRC=<build>/src pnpm companion:emulator:generate`, and
`LVGL_DIR=<build>/managed_components/lvgl__lvgl pnpm companion:emulator:build`.

`pnpm companion:voice:test` (`live-tests.mjs`) checks the site's browser voice client
and ticket route against the bridge's protocol; it needs no WASM.
