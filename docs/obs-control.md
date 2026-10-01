# Pantalla OBS (`/admin/screen`)

The show-control page for the video wall: a browser tab talks to OBS directly
(obs-websocket v5) and everything else — other admin devices, a Stream Deck,
the Owy bot — goes through the server's command bus.

## Pieces

| Layer            | Where                                | What                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OBS client store | `src/lib/obs/client.ts`              | One socket per tab (`EventSubscription.All \| InputVolumeMeters`), confirmed state from events, pending keys until OBS acks, reconnect with backoff, 1 fps monitors, scene thumbnails every 5 s (cached in `localStorage["obs-scene-previews"]`; "Capturar previews" walks every scene through program for sources that only render while active). |
| Executor         | `src/lib/obs/executor.ts`            | The connected tab that holds `obs_instances.executorId` runs commands, acks them, heartbeats status every 10 s. Other tabs observe; "Tomar el control" forces the seat. Also runs the loop timer.                                                                                                                                                  |
| Command bus      | `src/lib/orpc/obs-control/`          | `obsControl.send/pending/ack/claim/release/report/status/history`, `obsCue.*`. Commands persist in `obs_commands` (drained on reconnect, skipped after 30 s). Realtime channel `private:obs:<instance>` carries `command`, `status` and `cues` events.                                                                                             |
| Cues             | `obs_cues`                           | One press = OBS scene (+transition) + wall scene (`owyStage.setScene`) + launchpad sound (`play_sound` on `launchpad-sounds`).                                                                                                                                                                                                                     |
| HTTP             | `src/app/api/obs/[...path]/route.ts` | Companion / curl surface, see below.                                                                                                                                                                                                                                                                                                               |
| UI               | `src/components/Admin/screen/*`      | Header, Monitors, TransitionBar, SceneBus (thumbnail cards, `+` toggles the loop), AudioStrip, Rundown + CueEditor, LoopPanel (card strip with countdown ring, ± delay, presets), HistoryPanel, StreamDeckPanel, ConnectionSheet, hotkeys.                                                                                                         |

## Stream Deck (Bitfocus Companion, Generic HTTP)

1. Mint a key: `pnpm owy:key -- --name "stream deck"` (printed once; Better Auth stores the hash).
2. Companion → Connections → **Generic: HTTP**, base URL `https://owu.uy/api/obs/`.
3. Per button: `POST`, URL from the table, headers `{"x-api-key":"…"}`, body `{}`.
   The key only travels in the header — it is a full admin credential and
   query strings end up in access logs.
4. Feedback: `GET status` every 2 s into a variable; the JSON has `programScene`,
   `previewScene`, `studioMode`, `streaming`, `recording`, `executorOnline`,
   `currentCue` and `cues[]`.

| Path                                      | Effect                                |
| ----------------------------------------- | ------------------------------------- |
| `POST scene/{name}`                       | Scene to program (current transition) |
| `POST preview/{name}`                     | Scene to preview (studio mode)        |
| `POST take` / `POST cut`                  | Preview → program                     |
| `POST studio/on                           | off`                                  | Studio mode                      |
| `POST transition/{name}[/{ms}]`           | Transition and duration               |
| `POST mute/{input}[/on                    | off]`                                 | Mute (toggle without the suffix) |
| `POST stream/start                        | stop                                  | toggle`, `record/…`              | Outputs |
| `POST cue/{id}` / `cue/next` / `cue/prev` | Fire a cue                            |
| `POST loop/play                           | pause                                 | stop                             | next    | prev` | The automatic loop |
| `GET status` / `GET cues`                 | Feedback                              |

Commands return **202** when an executor tab is online and **409** when nobody
can run them (they still queue for 30 s). `?instance=2` targets the second rig.

## Keyboard

`1–9` scene to preview (studio) / air (direct), `⇧` + number = air now,
`↵`/`Space` TAKE, `⌫` CUT, `S` studio mode, `→`/`←` next/prev cue, `A–Z`
cue hotkeys, `M` mute the first audio input, `?` help.

## Developing without OBS

```
node scripts/mock-obs.mjs        # fake obs-websocket on :4455 (type a scene name + Enter to "click in OBS")
pnpm dev + pnpm dev:realtime     # then open /admin/screen
```

## Mixed content

`https://owu.uy` cannot open `ws://192.168.x.x:4455` (browsers block insecure
sockets from secure pages, except `localhost`). Run the executor tab on the OBS
machine (`localhost`) or publish OBS behind a `wss://` reverse proxy/tunnel and
type `wss://host` in the connection sheet. Phones, the Stream Deck and the bot
never need to reach OBS — they only need the server.
