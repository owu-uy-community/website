# Owy Companion — el Owy físico

Un Owy para la mesa del **mercado de ideas** del open space y para la charla: un knob
(Waveshare **ESP32-S3-Knob-Touch-LCD-1.8B**) que es **la cara y el botón**, y un
**bridge** en la Mac del venue que es **los oídos, la boca y el cerebro**. El panel
online **`/admin/owy`** maneja todo desde el celular.

```
knob: cara · tap · perilla · subtítulos ──API nativa (LAN, :6053, Noise)──► bridge (Mac, `companion:serve`)
                                                                           ├─ ffmpeg: mic de la Mac / DJI → · → PA o parlantes de la Mac
                                                                           ├─ AI Gateway: voz en vivo → respaldo → cascada → clip grabado
                                                                           ├─ cerebro local (o eve) · modo pitch · tools de Owy → owu.uy
                                                                           └─ sale a wss://owu.uy/api/realtime: ajustes, comandos, cara en el wall
owu.uy /admin/owy ─ el panel (celular o laptop): estado · knob virtual · sala · pantalla
```

El knob **no escucha ni habla**: sólo manda "me tocaron" y muestra la cara, lo que
entendió y la respuesta. Por el Wi-Fi viajan mensajes chicos, no audio. Si el knob
se apaga, el panel tiene los mismos botones y la cara sigue en el wall.

- `firmware/` — ESPHome 2026.8.2 (stock, sin componentes parcheados), sólo `owy-knob.yaml`.
- `bridge/` — el proceso Node de la Mac. Sus dependencias y scripts viven en `owy/package.json`.
- `emulator/` — la cara del firmware compilada a WebAssembly, en modo sólo-cara: la usa el
  wall (`/owy/stage`, escena **Owy**) y la charla. Ver `emulator/README.md`.

## Requisitos

- Node ≥ 24 y `pnpm install` en `owy/`.
- ESPHome 2026.8.2 (`brew install esphome` o pip) para compilar y flashear.
- `ffmpeg` en la Mac (`brew install ffmpeg`): captura el mic y reproduce por la salida.
- `AI_GATEWAY_API_KEY` (Vercel AI Gateway) y una llave del sitio con preset **companion**
  (`pnpm auth:key -- --owner companion --preset companion --name "Owy knob"` en la raíz, o
  /admin/acceso → Llaves API).

## Firmware (el knob)

`firmware/secrets.yaml` (gitignoreado):

```yaml
wifi_ssid: "..."
wifi_password: "..."
ap_password: "owyowyowy"             # hotspot de emergencia (mín. 8 chars)
api_key: "<openssl rand -base64 32>"  # clave Noise de la API nativa; el bridge usa la misma (#secrets)
ota_password: "..."
staff_pin: "2468"                     # 4-8 dígitos para el modo staff en pantalla
```

```bash
cd owy/companion/firmware
esphome config owy-knob.yaml                                           # valida
esphome compile owy-knob.yaml && esphome upload owy-knob.yaml --device /dev/cu.usbmodemXXXX   # USB
esphome run owy-knob.yaml                                              # después, OTA (owy-knob.local)
esphome logs owy-knob.yaml --device /dev/cu.usbmodemXXXX
```

`esphome upload` **no compila**: compilá antes. El USB-C llega al ESP32-S3 sólo en una
orientación del conector (`/dev/cu.usbmodem*`); si aparece `/dev/cu.usbserial*` estás del lado
del ESP32 secundario: dá vuelta el conector y nunca lo reflashees (maneja el DAC de fábrica).
Backup de fábrica: `python -m esptool --port /dev/cu.usbmodemXXXX --chip esp32s3 read-flash 0 0x1000000 ~/owy-knob-factory.bin`.

### Qué expone (el contrato con el bridge)

| Entidad / acción | Sentido | Uso |
| --- | --- | --- |
| `select.face_state` | bridge → knob | `idle · listening · thinking · speaking · happy · error · offline`. El bridge la pone en cada paso del turno; al pasar de listening a thinking el knob asiente solo |
| `sensor.taps` | knob → bridge | un contador: +1 por cada toque en la cara (o en `button.hablar`) fuera de pausa. El bridge compara valores consecutivos |
| `switch.microphone_privacy` | ambos | **pausa**: Owy no responde a toques (el toque abre ajustes). En el panel, «Pausa» |
| `number.screen_brightness` · `switch.reduced_motion` | ambos | brillo y animaciones mínimas (también desde la perilla y los ajustes en pantalla) |
| `switch.staff_mode` | ambos | se activa con el PIN en pantalla o desde el panel («Desbloquear 10 min»); se apaga solo a los 10 min |
| `button.hablar` · `button.reiniciar` | → knob | lo mismo que un toque · reinicio |
| acción `show_caption(body)` · `show_heard(body)` | bridge → knob | la respuesta mientras Owy habla · lo que entendió (« … ») en la vista de respuesta |
| acciones `show_card(title, presenter, room, time_slot)` · `show_qr(url, caption)` · `show_text(body)` | bridge → knob | páginas: la tarjeta que acaba de cargar, un QR, un texto |
| acción `express(feeling, lead_ms, strength)` | bridge → knob | la cara por frase mientras habla (`neutral · happy · excited · curious · thinking · empathetic · playful · surprised`) |
| acción `mouth_track(frames, lead_ms)` | bridge → knob | labios: 1 char base64url cada 40 ms, para el audio que suena en la Mac |
| acción `mic_level(level)` | bridge → knob | 0..100 del mic de la Mac mientras escucha: el aro azul y los ojos |
| `api.on_client_connected` / `on_client_disconnected` | knob | la cara vuelve a `idle` cuando el bridge conecta y queda `offline` (gris, "buscando a owy...") si se va |
| diagnóstico | knob → | `last_gesture`, `interface_page`, `power_status`, Wi-Fi, memoria, tiempo de render, «Captura de pantalla», prueba háptica |

La web del knob (`http://<ip>/`) sirve para probar sin bridge: `curl -X POST -d '' http://<ip>/button/Hablar/press`
(un toque; el bridge lo ve), `curl 'http://<ip>/select/Face%20State/set?option=listening'` (una cara),
`curl -N http://<ip>/events` (su estado, SSE). Los paths REST usan el **nombre** de la entidad.

### En la pantalla

- **Tap** en la cara: hablar (o "listo" mientras escucha; mientras habla, lo frena). En pausa, abre ajustes.
- **Mantener** o deslizar arriba: ajustes (pausa, brillo, animaciones mínimas, sonreí, cómo jugar, QR de la grilla, staff con PIN).
- **Girar** la perilla: brillo. Deslizar a la izquierda: ayuda; a la derecha: QR público.
- La cara queda siempre que no hay respuesta; la **primera línea de la respuesta** abre la vista de respuesta
  (Owy mini que sigue moviendo los labios, « lo que entendió », el texto) y vuelve a la cara 12 s después de terminar.
- Sin bridge conectado la cara queda gris "buscando a owy..."; vuelve sola.

## Bridge (la Mac)

Corre **sin interfaz** desde Terminal (el permiso de micrófono de macOS se lo da a la app de la terminal):

```bash
# owy/.env.local (el mismo archivo que lee `eve dev`; gitignoreado)
AI_GATEWAY_API_KEY=...                                 # voz y modelos
OWU_API_URL=https://www.owu.uy                         # el sitio: su API, su panel y su socket de realtime
OWY_API_KEY=companio...                                # llave preset «companion»
COMPANION_DEVICES=owy-knob@192.168.1.56#secrets        # id@host[:port][#psk]; "#secrets" lee api_key de firmware/secrets.yaml
# COMPANION_EVE_URL=https://<owy>.vercel.app           # opcional: el cerebro eve; sin esto contesta el cerebro local
```

```bash
pnpm -C owy companion:serve   # nativo, despierto (caffeinate), se rearranca solo; Ctrl-C lo apaga
```

Todo lo demás se cambia en el panel y queda guardado en el sitio: modo, de dónde sale el
audio, brillo, la entrada y salida de la Mac, modelos, voz, cerebro, mercado abierto. El bridge
**sale** al socket de realtime del sitio con su llave (no abre puertos), sigue los ajustes,
reporta cada 15 s y corre los comandos. Los últimos ajustes quedan en
`owy/companion/.eve/companion-state.json`: si el sitio no responde, arranca con esos. La página
local `http://127.0.0.1:3313/` es el respaldo cuando owu.uy no llega (mismos botones).

Variables opcionales (casi todas tienen su ajuste en el panel, que gana sobre el env):
`COMPANION_REALTIME_MODEL` (`gateway:google/gemini-3.8-live`), `COMPANION_VOICE` (`Kore`),
`COMPANION_REALTIME_FALLBACKS`, `COMPANION_BRAIN` (`eve` si hay `COMPANION_EVE_URL`, si no `local`),
`COMPANION_HOST_MIC` / `COMPANION_HOST_MIC_CHANNEL` / `COMPANION_HOST_MIC_GAIN_DB` (la entrada de la Mac:
vacío = el integrado), `COMPANION_HOST_SPEAKER` / `_LATENCY_MS` / `_TAIL_MS` (la salida: vacío = la del
sistema), `COMPANION_MIC_SOURCE` / `COMPANION_AUDIO_OUTPUT` (`host` | `laptop`, default `host`),
`COMPANION_PITCH_EVENT_ID` (la grilla donde caen los pitches si no es la del bot),
`COMPANION_WEB_BRIDGE=1` + `COMPANION_BRIDGE_SECRET` + `COMPANION_BRIDGE_PUBLIC_URL` + `COMPANION_WEB_ORIGINS`
(un navegador como audio de respaldo y la consola de la charla; ver [la consola](../../src/components/Admin/talk)),
`COMPANION_LOG_LEVEL`, `COMPANION_LOG_DIR` (pitches que no se entendieron, para el staff).

```bash
cd owy
pnpm companion:probe      # se conecta al knob: lista el contrato, cicla la cara, cuenta toques (sin modelo)
pnpm companion:text       # REPL de texto con la misma persona y tools (sin knob)
pnpm companion:netcheck   # gateway, modelos, eve y sitio con los timeouts vigentes
pnpm companion:dev        # bridge con recarga (tsx watch); companion:start sin recarga
pnpm companion:test       # vitest
pnpm companion:clips      # regenera los avisos pregrabados (offline, retry, pitch) con la voz de Owy
```

### Cómo funciona un turno

1. **Toque** en el knob (`sensor.taps`) o «Tocar» en el panel → el bridge abre el mic de la Mac (o el
   navegador enchufado), pone la cara en `listening` y le manda el nivel del mic (`mic_level`) para el aro.
2. **Segundo toque** («Listo») o la pausa que detecta el modelo → `show_heard` con lo que entendió, cara `thinking`.
   Un toque antes de decir nada lo cancela sin ruido.
3. La **respuesta** suena por la salida de la Mac (o el navegador); al knob van la transcripción (`show_caption`),
   los labios (`mouth_track`) y la cara por frase (`express`); cara `speaking`. El wall recibe lo mismo.
4. Termina → `idle`. Un toque mientras habla lo **frena** (cara normal, nunca un error). Si algo falla de verdad,
   cara `error` 3 s y vuelve a `idle`.
5. **Modo pitch**: toque → graba (sin modelo, hasta `COMPANION_PITCH_MAX_S`); toque («Enviar») → transcribe, arma
   la tarjeta y la carga en la grilla (`tracks.createPlaced`); si falta el tema o el nombre, Owy pregunta y abre
   el mic de la Mac solo para la respuesta; la tarjeta aparece en el knob (`show_card`) y Owy dice dónde quedó.
6. **Sin knob** es igual: el botón del panel es el toque y la cara vive en el wall. **Sin micrófono** (ni Mac ni
   navegador) Owy lo dice en pantalla y no escucha a nadie.

Es half-duplex: mientras Owy habla, no escucha. En la Mac no hay cancelación de eco: mientras suena y
`COMPANION_HOST_SPEAKER_TAIL_MS` después, su mic no escucha (nunca durante un pitch). Cada toque recuerda
los anteriores hasta `COMPANION_EVE_IDLE_RESET_S` (180 s) de silencio.

### Respaldos

Un tap **nunca se rechaza por el modelo**. Cada turno elige su camino al empezar; el log dice
`turn path=… ttfa=… total=…`:

| Camino | Cuándo |
| --- | --- |
| `realtime` | Gemini 3.8 Live conectado (la sesión se mantiene tibia entre turnos) |
| `fallback` | Gemini no conecta: `COMPANION_REALTIME_FALLBACKS` en orden (GPT Realtime, Grok Voice) |
| `cascade` | Ningún realtime vivo, o el modelo no reacciona ~2,5 s después de que la persona calla (`COMPANION_ACK_MS`): el bridge graba el turno, lo transcribe (modelos sin retención), contesta (eve o el modelo de texto con las tools) y lo dice frase a frase con la voz de Owy |
| `offline` | Ni eso: el clip pregrabado por la salida de la Mac y el QR de la grilla en el knob |

Si eve no contesta, contesta el cerebro local y eve queda en pausa un minuto. Si la salida de la
Mac se cae a mitad de respuesta, el resto sale por el navegador enchufado; si no hay ninguno, la
respuesta va en pantalla (knob y wall) y el turno termina igual.

## El panel

- **`/admin/owy`** — el día a día, desde el celular: estado (knob, bridge, voz, audio de la Mac),
  modo (Conversación · Pitch · Charla · Pausa), el **knob virtual** (Tocar, Pitch/Enviar, Callar,
  Decir…, Preguntar…, este navegador como audio), subtítulos en vivo; **Sala** (Mercado abierto,
  countdown, castear la última tarjeta, aviso); **Pantalla** (presets 1–9 al aire, escenas de Owy, links a la mesa y la consola).
- **`/admin/companion`** — Ajustes de Owy: cada ajuste del knob y del bridge, la entrada/salida de la Mac
  («Grabar 4 s», «Tono en la Mac»), modelos, voz, cerebro, modo pitch.
- **`/admin/owy/charla`** — la consola de «Owy, en vivo»; **`/admin/owy/scenes`** — la mesa del wall.

## Verificar

```bash
pnpm -C owy typecheck && pnpm -C owy companion:test          # bridge
pnpm -C owy companion:interaction-test                       # modelo C++ de la cara (host)
pnpm companion:emulator:test && pnpm companion:voice:test    # cara WASM + seams del navegador
cd owy/companion/firmware && esphome config owy-knob.yaml && esphome compile owy-knob.yaml
pnpm -C owy companion:netcheck                               # la mañana del evento: gateway, modelos, eve, sitio
pnpm -C owy companion:text                                   # REPL de texto con la misma persona y tools
```

Prueba sin tocar el knob: `curl -X POST -d '' http://<knob>/button/Hablar/press` (el bridge ve el tap);
estado del knob: `curl -N http://<knob>/events` (SSE).

## Checklist del día

- [ ] Router propio (o el Wi-Fi del venue sin captive portal); el knob en un cargador de pared, lejos de la Mac.
- [ ] `secrets.yaml` con el SSID del venue; reflash OTA la noche anterior.
- [ ] `pnpm companion:netcheck` desde la Mac ya en el venue.
- [ ] `pnpm -C owy companion:serve` desde Terminal (con permiso de Micrófono y Red local); en `/admin/owy` el bridge «en línea» y el knob conectado.
- [ ] Ajustes → Entrada de la Mac = «Wireless Microphone RX» (el DJI), «Grabar 4 s» muestra nivel; «Tono en la Mac» suena por la PA.
- [ ] Modo según el momento (Conversación · Pitch · Charla) y **Mercado abierto** al empezar el mercado; apagarlo al cerrar.
- [ ] Cartel en la mesa: "Tocá y hablame. Tocá de nuevo cuando termines."
