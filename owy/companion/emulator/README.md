# Companion face runtime

Owy's face for the web: the firmware's own `Companion` model and `FaceRenderer`
(`owy/companion/firmware/companion_model.h`, `companion_lvgl.h`) over the LVGL
scene ESPHome generates from `owy-knob.yaml`, compiled to WebAssembly. The video
wall and the talk deck draw it (`src/components/OwyStage/Face.tsx` loads
`public/companion-runtime/face.mjs`), so the big Owy makes the knob's exact faces.

It is face-only: no gestures, pages, sleep or hints. `face.mjs` takes the bridge's
states (`idle · listening · thinking · speaking · happy · error · offline`), the
per-sentence expressions and the lip track, exactly as the knob gets them.

## Rebuild

Needed after a change to the face model, the renderer or the LVGL pages. Three
steps, from the repository root (Emscripten 6.0.9 under `owy/companion/.eve/emsdk`,
LVGL 9.5.0 from an ESPHome build of the knob):

```sh
pnpm companion:emulator:generate   # esphome compile --only-generate owy-knob.yaml → generated/ (needs firmware/secrets.yaml)
pnpm companion:emulator:build      # LVGL + runtime.cpp → public/companion-runtime/owy-runtime.{mjs,wasm} + manifest
pnpm companion:emulator:test       # provenance + a smoke run of the face
```

Without `secrets.yaml`, generate from a build made elsewhere:
`OWY_SCENE_SRC=<build>/src pnpm companion:emulator:generate`, and
`LVGL_DIR=<build>/managed_components/lvgl__lvgl pnpm companion:emulator:build`.

`pnpm companion:voice:test` (`live-tests.mjs`) checks the site's browser voice client
and ticket route against the bridge's protocol; it needs no WASM.
