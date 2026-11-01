# Owy Companion — el Owy físico

Un Owy de bolsillo para la mesa del **mercado de ideas** del open space: una
Waveshare **ESP32-S3-Touch-AMOLED-1.75C** (pantalla redonda táctil, dos
micrófonos, parlante) con cara animada que escucha propuestas de charlas,
contesta hablando y las deja en la grilla usando **las mismas tools que el Owy
de Slack/Telegram**.

```
[dispositivo ESPHome]  ──native API (:6053, Noise)──►  [bridge Node en una laptop del venue]
  mics 16 kHz ─┐ voice_assistant                          │  device/esphome.ts  (esphome-client)
  parlante    ─┘ + micro_wake_word                        │  realtime/session.ts ◄── Gemini 3.8 Live vía AI Gateway (AI SDK realtime, codec sobre ws)
  cara LVGL + touch + IMU (tap = hablar, hold = ajustes)  │  realtime/tools.ts   ──► agent/tools/* (ctx shim, gate de staff)
                                                          └─ owu-api.ts (x-api-key) ──► owu.uy → broadcast → grilla / kiosk / OBS
```

- `firmware/` — proyecto ESPHome con un parche local mínimo del driver I2S
  (fijado a 2026.8.2; ver `firmware/components/README.md`).
- `bridge/` — proceso Node que hace de "Home Assistant" para el `voice_assistant`
  del dispositivo y corre la sesión de voz. Sus dependencias y scripts viven en
  `owy/package.json`.
- `emulator/` — el runtime LVGL del firmware compilado a WebAssembly, servido en
  **`/admin/companion`**: la cara y su máquina de estados se iteran en el browser
  sin placa ni reflasheo. Ver [cómo abrirlo, compilarlo y probarlo](emulator/README.md).

El workbench también conversa **a través de este mismo bridge**: ejecutar
`COMPANION_WEB_BRIDGE=1 pnpm companion:dev` habilita un transporte WebSocket de
dispositivo virtual en loopback `:3312`. Comparte `DeviceSession`, prompts,
conocimiento, modelo, tools y audio de 16 kHz con el gadget. Pantalla/volumen se
aplican al emulador; las acciones del evento requieren permisos explícitos y
`OWY_API_KEY`. No es una sesión durable de Eve. [Configuración web y seguridad](emulator/README.md#speak-with-owy).

## Requisitos

- Node ≥ 24 y `pnpm install` en `owy/` (ya incluye `esphome-client`, `@ai-sdk/google`, `ws`, `tsx`, `vitest`).
- ESPHome 2026.8.2 para esta versión. Revalidar el parche I2S antes de actualizar.
- `AI_GATEWAY_API_KEY` (Vercel AI Gateway): el modelo por defecto es `gateway:google/gemini-3.8-live`.
  Sólo hace falta `GOOGLE_GENERATIVE_AI_API_KEY` si elegís el proveedor directo (`google:…`).
- La llave de la API del sitio, una por dispositivo: `pnpm auth:key -- --owner companion-<lugar> --preset companion --name "Owy <lugar>"` en la raíz del repo (o /admin/acceso → Llaves API). Vale también para hablar con las rutas `/companion/*` de eve; revocable aparte.

## Firmware

### 1. `secrets.yaml`

Creá `firmware/secrets.yaml` (está gitignoreado) con:

```yaml
wifi_ssid: "..."
wifi_password: "..."
ap_password: "owyowyowy"             # hotspot de emergencia (mín. 8 chars)
api_key: "<openssl rand -base64 32>"  # clave Noise de la API nativa; el bridge usa la misma
ota_password: "..."
staff_pin: "2468"                     # 4-8 dígitos para el modo staff en pantalla
```

### 2. Backup del firmware de fábrica (una vez)

```bash
esptool --port /dev/cu.usbmodem13201 --chip esp32s3 read-flash 0 0x2000000 ~/owy-companion-factory.bin
```

### 3. Compilar y flashear

```bash
cd owy/companion/firmware
esphome config owy-companion.yaml                                   # valida
esphome run owy-companion.yaml --device /dev/cu.usbmodem13201       # primera vez por USB
esphome run owy-companion.yaml                                      # después, OTA (owy-companion.local)
esphome logs owy-companion.yaml --device /dev/cu.usbmodem13201
```

La primera compilación baja el toolchain de ESP-IDF (varios minutos). El build va a
`owy/companion/.eve/esphome-build/` (la ruta se resuelve desde `.esphome/`).

`esphome upload` **no compila**. Usá `esphome run` o ejecutá `compile` y después
`upload`. Verificá la versión del proyecto y la fecha de compilación que informa
el dispositivo; que el upload termine no prueba qué versión quedó corriendo.

Si el USB deja de enumerar después de un flasheo malo: mantené **BOOT** y tocá **PWR**.

### Primer arranque (qué mirar)

- Log USB: `Connected` de Wi-Fi y `API client connected` cuando corre el bridge. Con `logger: level: DEBUG`
  se ve el scan I²C (`Found i2c device at 0x..`).
- La web del dispositivo (`http://owy-companion.local/`) permite probar el tono, la cara (`Face State`)
  y los switches sin bridge. Ojo: los paths REST usan el **nombre** de la entidad (`/select/Face%20State/set?option=listening`).
- La 1.75C no usa la TCA9554 (0x20) de la variante común. PWR conserva su función
  nativa en el AXP2101; BOOT es GPIO0. No se escriben registros de carga ni alimentación.
- **macOS "Red local"**: macOS 26 bloquea el acceso LAN de binarios de terceros (node, python de Homebrew)
  cuando la app responsable de la terminal no tiene el permiso, o cuando la terminal embebida no
  transmite la app responsable (Orca). Síntoma: `ping`/`curl` llegan al dispositivo pero
  `pnpm companion:probe` o el OTA de `esphome run` dan `EHOSTUNREACH` / "No route to host".
  Fix: Ajustes → Privacidad y seguridad → Red local → habilitar la terminal (Terminal.app / Ghostty) y correr el
  bridge desde ahí. Workaround sin permisos: un relay con el Python de Apple (exento del bloqueo) y el bridge
  apuntando a localhost:
  ```bash
  /usr/bin/python3 companion/bridge/scripts/lan-relay.py --target 192.168.1.211      # dejar corriendo
  COMPANION_DEVICES='owy-1@127.0.0.1:6053#secrets' pnpm companion:probe
  ```

### Variante de placa

`owy-companion.yaml` está configurado para la **1.75C** (caja de aluminio, 32MB flash,
sin RTC ni microSD). Para una 1.75 común cambiá en `substitutions`:
`i2s_mclk_pin: GPIO42`, `lcd_reset_pin: GPIO39`, `touch_reset_pin: GPIO40`.
El scan I²C de la C lista 0x18/0x40/0x5A/0x34/0x6B; un 0x51 (RTC) delata una 1.75.
La integración de movimiento/potencia de esta versión está validada para la C;
no asumir que cambiar tres pines valida todos los periféricos de otra variante.

Síntomas de pines equivocados: pantalla negra (`lcd_reset_pin`), touch mudo
(`touch_reset_pin`), audio en silencio o ruido (`i2s_mclk_pin`).

El hardware vive en `packages/boards/<placa>.yaml`; el resto de `packages/` es común
a todas las placas (voz, controles, cara, conectividad). Una placa nueva = un archivo
de hardware con los ids compartidos (`bus_a`, `amoled`, `touch`, `screen_light`,
`mic`, `va_speaker`, `power_status`) + un root `owy-<placa>.yaml`.

### Variante Knob 1.8B (`owy-knob.yaml`)

Waveshare **ESP32-S3-Knob-Touch-LCD-1.8B** (la B es la caja negra; misma placa que la 1.8).
Mismo firmware y mismo bridge (`COMPANION_DEVICES=...,owy-knob@owy-knob.local#secrets`),
con `packages/boards/knob18.yaml`:

| | Knob 1.8B |
| --- | --- |
| Pantalla | ST77916 360×360 QSPI (CLK 13, D0-3 15/16/17/18, CS 14, RST 21), backlight PWM GPIO47. Modelo `ESP-VOCAT` de ESPHome (misma tabla de init que el demo de Waveshare) |
| Touch | CST816 @0x15 (INT 9, RST 10), I²C SDA 11 / SCL 12 |
| Mic | PDM MEMS (CLK 45, DATA 46) en su propio bus I2S (puerto 0) |
| Audio out | **no hay parlante ni amplificador**: PCM5100A → jack 3.5 mm (BCLK 39, WS 40, DOUT 41). Se configura igual como `va_speaker` para no tocar la máquina de voz; sin nada enchufado la unidad es muda (cara + mic). Un parlante activo en el jack la hace hablar sin reflashear |
| Perilla | **no es un encoder de cuadratura**: es un switch de detentes bidireccional (A=GPIO8 pulsa al girar en sentido horario, B=GPIO7 antihorario; el driver de Waveshare `bidi_switch_knob.c` los lee como dos botones). Se leen como dos `binary_sensor` con debounce → **brillo ±5%** con un anillo en el borde de la cara y `brillo N%` arriba (1.2 s), más un tick háptico. Sin pulsador: el "botón" es el touch |
| Háptica | DRV2605 @0x5A con la receta del demo de Waveshare (ERM lazo abierto, librería 5, disparo por I²C). Efectos: tap 4 (click), acariciar 7 (bump), mantener/arriba 10 (doble click), swipe 24, escuchando 24, respondiendo 7, detente 26. `button.vibración_de_prueba` para probar desde la web |
| Mudo | `listening_chime` e `interaction_sounds` arrancan apagados en esta placa (sólo agregan latencia sin parlante); el tick háptico avisa que Owy escucha |
| Experiencia | **La cara queda siempre que no hay respuesta**: escuchando (aro de 24 puntos azul cuya opacidad sigue el mic, con `mic_vu_gain`; en el follow-up se vacía en 8 s) y pensando (cometa amarillo) pasan en la cara. La **primera caption de una respuesta** abre la *vista de respuesta* (un Owy mini que sigue moviendo los labios, « lo que entendió » en una píldora gris, el texto anclado abajo, aro amarillo respirando) y la fija con el global `page_hold` (face.yaml) para que sobreviva la ventana de follow-up; al terminar la conversación se libera y la cara vuelve a los 12 s. Tocar la respuesta = hablar de nuevo. El bridge manda la transcripción por la acción `show_caption` cuando la placa la anuncia |
| Revisión | `button.captura_de_pantalla` (LV_USE_SNAPSHOT + `knob_shot.h`) postea la pantalla real en RGB565 a `${screenshot_url}`; correr `/usr/bin/python3 owy/companion/scripts/knob-shots.py` en la laptop (Apple python: el firewall de macOS deja pasar sus conexiones LAN) y mirar los PNG en `/tmp/knob-shots`. Una captura frena el loop ~0.5 s: no sacarla en medio de audio. Para un turno sin hablar: `say -v "Flo (Spanish (Spain))" "..."` con la perilla al lado de la Mac |
| Sin | IMU, PMIC, botón BOOT (GPIO0 es el mux del DAC), micro-SD (no se usa) |
| Cara | la geometría animada escala en C++ con `-DOWY_FACE_SCALE=0.7725` (360/466); páginas secundarias vía las substitutions `page_w`, `panel_w`, `quick_h`, etc. (defaults 466 en `face.yaml`/`companion.yaml`, overrides en `owy-knob.yaml`) |

**USB**: la placa tiene dos MCUs y el USB-C llega **al ESP32-S3 o al ESP32 secundario según
la orientación del conector**. Si aparece `/dev/cu.usbserial-*` (CH340) estás del lado del
ESP32: dá vuelta el conector hasta ver `/dev/cu.usbmodem*`. No reflashear el ESP32
secundario: su firmware de fábrica maneja el pin de mute (XSMT) del DAC.

```bash
cd owy/companion/firmware
esphome config owy-knob.yaml
/opt/homebrew/Cellar/esphome/2026.8.2/libexec/bin/python -m esptool --port /dev/cu.usbmodemXXXX \
  --chip esp32s3 read-flash 0 0x1000000 ~/owy-knob-factory.bin          # backup de fábrica (16MB)
esphome compile owy-knob.yaml && esphome upload owy-knob.yaml --device /dev/cu.usbmodemXXXX
esphome logs owy-knob.yaml --device /dev/cu.usbmodemXXXX
```

Si el mic no capta: probar `channel: right` o `pdm_dsr: 8` en `knob18.yaml`. Si el touch
no responde: `skip_probe: true` en `cst816`. Si la perilla va al revés: intercambiá los pines
de `knob_cw`/`knob_ccw`. Para que maneje volumen en vez de brillo: cambiá el `number.set`
de `knob_turn` a `volume` (mismo overlay).

### Qué expone el firmware (contrato con el bridge)

| Entidad / acción | Uso |
| --- | --- |
| `select.face_state` | `idle · listening · thinking · speaking · happy · error · offline` |
| `switch.staff_mode` | se activa con el PIN en pantalla, se apaga solo a los 10 min |
| `switch.marketplace_open` | habilita `propose_talk` para el público |
| `switch.quiet_mode` | sin anuncios ambientales ni tono de escucha |
| `switch.wake_word` | "Okay Nabu"; conserva la preferencia tras reiniciar y sólo se arma con bridge conectado |
| `switch.continuous_conversation` | activado por defecto; reabre escucha después de cada respuesta, se configura en la web del dispositivo |
| `switch.listening_chime` | activado por defecto; señal suave de 80 ms antes de cada escucha, respeta volumen y modo silencioso |
| `switch.interaction_sounds` | sonido suave opcional al acariciar/sacudir; sin cola durante voz, privacidad, quiet o animación mínima |
| `switch.microphone_privacy` | detiene captura y wake word; bloquea tap, BOOT y rearmado; conserva preferencia y no modifica el switch wake word |
| `switch.motion_face` / `switch.reduced_motion` | seguimiento por IMU y animaciones decorativas, configurables en pantalla |
| `switch.motion_reverse_x` / `switch.motion_reverse_y` | invertir ejes visuales desde la web si cambia el montaje |
| `number.screen_brightness` | brillo preferido 10–100%; al tocar no vuelve arbitrariamente a 80% |
| `text_sensor.power_status` / `sensor.battery_level` | lectura del AXP2101; porcentaje desconocido/ausente no se inventa |
| `binary_sensor.motion_sensor_ready` | IMU válida y reciente (<500 ms) |
| `text_sensor.interface_page` / `text_sensor.last_gesture` | diagnóstico de navegación y última interacción clasificada |
| `sensor.internal_free_memory` / `sensor.internal_largest_block` | memoria interna libre y bloque contiguo, cada 30 s |
| `sensor.motion_poll_rate` / `sensor.motion_maximum_gap` / `sensor.animation_tick_rate` | cadencia real y máximo intervalo entre callbacks; no equivalen a FPS del panel |
| `sensor.imu_chip_temperature` | temperatura del chip, no del ambiente; lectura lenta del mismo burst |
| `button.companion_sound` | prueba del feedback con las mismas reglas de prioridad, página y cooldown |
| `button.quick_controls` / `button.back_to_owy` / `button.center_motion_face` / `button.smile` | alternativas explícitas a gestos y movimiento |
| `button.calibrate_motion` / `button.cancel_motion_calibration` | calibración guiada de bias y posición neutral; cancelación conserva el ajuste anterior |
| `text_sensor.motion_calibration` / `text_sensor.saved_motion_calibration` | progreso/resultado y perfil guardado, sin credenciales |
| `binary_sensor.playback_ready` | confirma que ambos consumidores del mic liberaron el bus antes del audio |
| `text_sensor.audio_state` | `offline / preparing / listening / follow_up / thinking / speaking / draining / recovering / wake_word / idle / error / muting / privacy / feedback / calibrating` |
| `button.hablar` | mismo comportamiento que tap: hablar o cancelar |
| `sensor.render_time` / `sensor.render_time_max` | ms de render LVGL por refresco (media y peor de 5 s), en el mismo loop que alimenta el parlante |
| acción `mouth_track(frames, lead_ms)` | labios para turnos que suenan en la laptop: 1 char base64url cada 40 ms (`bridge/src/audio/mouth.ts`). Si el audio sale del dispositivo, la boca sigue al propio parlante (tap de PCM en `components/i2s_audio`) |
| `number.volumen` | volumen del parlante |
| `button.tono_de_prueba` | tono suave de prueba de 1 kHz / 80 ms |
| `select.mic_source` / `select.audio_output` | `dispositivo · laptop · mac` (mic) y `dispositivo · laptop` (salida): el bridge los lee al empezar cada turno (ver *Modos de audio* y *Micrófono de la Mac*) |
| acciones `show_card(title, presenter, room, time_slot)`, `show_qr(url, caption)`, `show_text(body)` | páginas de pantalla |
| acción `show_caption(body)` (sólo Knob) | el bridge manda la transcripción de la respuesta a las placas que la anuncian |
| `switch.pitch_mode` / `select.pitch_voice` | **Modo pitch** (ver abajo): cada toque graba una propuesta en vez de conversar; wake word y follow-ups quedan apagados. `pitch_voice` (`Callado · Confirma · Confirma y comenta`): qué dice Owy. Persisten tras reiniciar |
| `binary_sensor.pitch_submit` / `text_sensor.pitch_state` | pulso en el segundo toque (el bridge cierra el run en el flanco de subida); `arming · recording · sent` para la háptica de la placa |
| acción `pitch_prompt(kind)` | `topic` / `name`: terminada la pregunta de Owy, el mic se abre solo para la respuesta (ese run sale como `pitch-answer`); `idle`: cancela una pendiente |

### Interacción cotidiana

- Tap en la cara o BOOT corto: hablar/cancelar. Con privacidad activa abre ajustes,
  nunca reactiva el micrófono implícitamente.
- Arrastrar: la mirada sigue el dedo; acariciar de lado a lado: sonrisa breve.
- Inclinar: mirada con fusión gyro/gravedad. Sacudir de ida y vuelta: reacción
  breve y sonido opcional. Requiere tres excursiones alternadas en 1 s, calma y
  cooldown de 4 s; un golpe o levantarlo no cuenta. Nunca inicia una charla.
- Swipe arriba o mantener 0.8 s (cara o BOOT): ajustes rápidos. La pantalla
  principal ahora es sólo la cara: sin texto ni botones.
- Swipe izquierda: ayuda; derecha: QR público de OWU Conf. Alternativas en ajustes.
- Ajustes: volumen y estado, micrófono, charla continua, tonos, seguimiento, animaciones mínimas,
  brillo, centrar mirada, sonrisa, ayuda y grilla. Staff sigue separado por PIN,
  ahora con una salida visible sin tener que ingresar una clave.
- **Calibrar movimiento**: abrí ajustes manteniendo la cara o BOOT; apoyá el
  dispositivo en una superficie firme en su posición de uso, tocá Comenzar y
  soltá. Tiene 1 s para asentarse y necesita 2 s quieto. Moverlo reinicia el
  progreso; a los 15 s permite reintentar. Volver cancela sin perder el ajuste
  anterior. No acepta conversación mientras mide. El bias/neutral exitoso se
  guarda y se restauró correctamente tras flash/reinicio en la prueba física.
  ESPHome agrupa escrituras a flash: esperá al menos 60 s antes de cortar la
  alimentación. **Centrar mirada** sigue siendo un ajuste temporal, sin medir bias.
- PWR: función nativa de encendido/apagado. No se reemplaza con gestos de software.

No hay doble tap, multitouch ni presión. Un solo clasificador procesa cada contacto;
una caricia que vuelve al inicio no puede disparar también «hablar». La privacidad
es de software: detiene los consumidores de audio, no desconecta eléctricamente los
micrófonos. Apagar «seguir movimiento» desactiva la respuesta al IMU; «animaciones
mínimas» también quita parpadeos, miradas de reposo y reacciones decorativas.

El render mantiene RGB565/25% de buffer parcial y actualiza sólo geometría entera
cambiada: objetivo ~60 Hz en reposo y ~30 Hz durante voz, sin dibujar fuera de la
cara o con pantalla pausada. El IMU se consulta cada 10 ms: el enum 125 Hz produce
~112.1 Hz físicos en 6DOF. La fusión usa tiempo real transcurrido, transporte de
gravedad por gyro, corrección por acelerómetro y bias tras estabilidad sostenida.
No usa heading absoluto, FIFO ni sample lock. Un burst no garantiza coherencia
perfecta; no es un sistema de navegación.

La boca observa el audio existente. Los cues comparten un buffer fijo de 2560 B,
ataque/release suaves y amplitud limitada. Se espera inicio y drenaje del parlante
antes de rearmar el mic; cancelación/privacidad detienen cualquier cue pendiente.
El receptor de voz tiene 32 KiB en PSRAM para ráfagas de transporte; el ring del
parlante y el adelanto del bridge siguen en 100 ms, con timeout de 500 ms.
Un mic azul indica captura de conversación; el mic tachado amarillo indica
privacidad. En reposo el wake word sigue usando captura local si está habilitado.
No hay cámara, sensor de presencia/luz ni motor háptico establecido en este modelo.

## Modos de audio (dispositivo, Mac o laptop)

Cada dispositivo elige dónde viven su micrófono y su salida: `select.mic_source` y
`select.audio_output` (`dispositivo` | `laptop` | `mac`), persistentes, desde sus ajustes rápidos
("Mic: …", "Audio: …") o desde **Control** en `/admin/companion` (el modo «Charla» pone las dos
en la Mac). Una placa flasheada antes de que existiera la salida `mac` la deja en manos del bridge
hasta el próximo flash (el panel lo marca «lo guarda el bridge»).

- **dispositivo**: como siempre (mic del gadget; parlante/jack del gadget).
- **mac**: la Mac donde corre el bridge, sin navegador de por medio. Mic: graba una de sus entradas
  (el integrado o un receptor DJI; ver *Micrófono de la Mac*). Salida: Owy suena por la salida de la
  Mac (la PA de la sala enchufada, sus parlantes) con ffmpeg (`COMPANION_HOST_SPEAKER`, por nombre;
  vacío = la del sistema). No hay cancelación de eco: mientras Owy suena ahí, y
  `COMPANION_HOST_SPEAKER_TAIL_MS` después, el mic de la Mac no escucha (nunca durante un pitch).
  `COMPANION_HOST_SPEAKER_LATENCY_MS` alinea la boca de la cara con lo que se oye (ajustar a ojo).
- **laptop**: un navegador enchufado como audio del dispositivo: en **Control**, «Usar este
  navegador como audio» en la tarjeta de la placa. Ese navegador recibe los mismos eventos y el
  PCM que el gadget, abre su mic en cada turno y reproduce la respuesta, hasta «Desenchufar» o
  cerrar la pestaña (si se cierra a mitad de una respuesta, el resto sale por la placa). El gadget
  sigue siendo el disparador, la cara y los subtítulos. Sin navegador enchufado, el bridge avisa y
  ese turno usa el audio del dispositivo. Mic y salida se eligen por separado.

Requiere `COMPANION_WEB_BRIDGE=1` (transporte web en `:3312`); en macOS el navegador pide
permiso de micrófono una vez. La pestaña puede quedar en segundo plano (no se corta al
ocultarse, a diferencia de una conversación propia). Los turnos enchufados no vencen a los
5 minutos (6 h). Prueba sin hablar: `companion/scripts/knob-peer.mts` (cliente WS que hace de
navegador y manda un WAV de 16 kHz generado con `say -o q.wav --data-format=LEI16@16000`).

El bridge no puede correr dentro del sitio en Vercel (necesita la LAN del venue, el
audio de la laptop y sockets persistentes); el sitio sólo lo controla.

## Bridge

El bridge corre **sin interfaz** en la Mac del venue y se maneja desde el panel online
(`/admin/companion` → **Control**). En la Mac sólo van los secretos y la plomería, en
`owy/.env.local` (el mismo archivo que usa `eve dev`; gitignoreado):

```bash
# owy/.env.local
AI_GATEWAY_API_KEY=...                                 # voz y modelos (gateway:google/gemini-3.8-live por defecto)
OWU_API_URL=https://www.owu.uy                         # el sitio: su API, su panel y su socket de realtime
OWY_API_KEY=companion...                               # llave preset «companion» (pnpm auth:key -- --owner companion --preset companion)
COMPANION_DEVICES=owy-knob@192.168.1.56#secrets        # id@host[:port][#psk]; "#secrets" lee api_key de firmware/secrets.yaml
COMPANION_EVE_URL=https://<owy>.vercel.app             # cerebro eve (si falta, contesta el cerebro local)
```

```bash
pnpm -C owy companion:serve   # desde Terminal: nativo (mic y parlante de la Mac), despierto (caffeinate), se rearranca solo
```

Todo lo demás —modo (conversación · pitch · charla · pausa), de dónde sale el audio, volumen y
brillo de cada placa, el micrófono y la salida de la Mac, modelos, voz, cerebro, tiempos— se
cambia en **Control**, y queda guardado en el sitio. El bridge se conecta **saliendo** al socket de
realtime del sitio con su llave (no abre puertos de la Mac), sigue los ajustes, reporta cada 15 s
lo que está en efecto (la respuesta trae todos los ajustes: sincronización completa) y corre los
comandos del panel (tono de prueba, decir, callar, staff 10 min, grabar 4 s de la Mac, buscar
placas en la red, reiniciar). Un cambio hecho en la pantalla de la placa, por voz o en la página
local también llega al panel. Los últimos ajustes quedan en `owy/companion/.eve/companion-state.json`:
si el sitio no responde al arrancar, sigue con esos. Un ajuste que sólo aplica al reiniciar
(modelo, voz, cerebro…) espera un momento sin charlas y reinicia el bridge (`companion:serve` y
Docker lo levantan solos). Las variables de entorno quedan como valores por defecto.

**Por voz** (tool `ajustes`): cualquiera puede cambiar volumen, brillo, modo silencioso, tono de
escucha, charla continua y animaciones mínimas, y pausar el micrófono (después de la respuesta);
lo demás sólo en una sesión de staff; apagar la pausa del micrófono, nunca por voz.

La página local `http://127.0.0.1:3313/` queda sólo como respaldo (sitio caído).

```bash
cd owy

pnpm companion:tools     # lista las tools montadas y sus schemas (sin modelo ni dispositivo)
pnpm companion:probe     # se conecta al dispositivo por la API nativa: lista entidades, cicla la cara, tono, card (sin modelo)
pnpm companion:audio-check # regresión sobre el hardware; parar companion:dev antes (sin Gemini)
pnpm companion:text      # REPL de texto con la misma persona/tools (sin dispositivo)
pnpm companion:dev       # bridge con recarga (tsx watch)
pnpm companion:start
pnpm companion:test      # vitest
pnpm companion:driver-test # regresión C++ del driver con notificación RTOS demorada (requiere c++)
pnpm companion:interaction-test # modelo C++ real de gestos/movimiento/cara/potencia con sanitizers
```

Variables opcionales: `COMPANION_REALTIME_MODEL` (ver [Modelo realtime](#modelo-realtime);
`gateway:google/gemini-3.8-live` por defecto), `COMPANION_VOICE` (`Kore`; con OpenAI usá una
voz suya, p. ej. `marin`), `COMPANION_BRAIN` (`eve` | `local`; ver [Cerebro](#cerebro-eve-o-local)),
`COMPANION_EVE_IDLE_RESET_S` (180), `COMPANION_EVENT_NAME` (`OWU Conf 2026`),
`COMPANION_PUBLIC_SITE_URL` (para el QR), `COMPANION_PROPOSAL_COOLDOWN_S` (60),
`COMPANION_MARKETPLACE_OPEN` / `COMPANION_STAFF_MODE` (fallbacks cuando no hay dispositivo,
p. ej. en el REPL), `COMPANION_LOG_LEVEL`, `COMPANION_WEB_DEBUG=1` (loguea también las sesiones
del navegador, que por defecto son mudas).

### Docker

Para levantar el bridge sin instalar Node ni pnpm en la máquina del venue:

```bash
pnpm -C owy companion:docker                               # = docker compose -f owy/companion/bridge/compose.yaml up -d --build
docker compose -f owy/companion/bridge/compose.yaml logs -f
docker compose -f owy/companion/bridge/compose.yaml down
```

Lee las mismas variables de `owy/.env.local` y monta `firmware/secrets.yaml` (solo lectura) para
`#secrets`; la imagen no lleva ni uno ni otro. Arranca solo con Docker (`restart: unless-stopped`).
Dentro del contenedor `localhost` es el contenedor: usá IPs en `COMPANION_DEVICES` (los nombres
`.local` no resuelven) y `http://host.docker.internal:<puerto>` para `eve dev` o el sitio corriendo en
la misma máquina. El web bridge (3312) y la página de ajustes (3313) escuchan en `0.0.0.0` dentro del
contenedor (`COMPANION_BIND_HOST`) y se publican sólo en el `127.0.0.1` del host, así que el sitio y
el navegador de la laptop los usan igual que sin Docker. El audio de laptop sigue siendo un navegador
en esa máquina.

### Cerebro: eve o local

El modelo realtime siempre es **oídos y boca**. Quién *piensa* lo decide `COMPANION_BRAIN`
(por defecto `eve` si hay `COMPANION_EVE_URL`, si no `local`):

| | `eve` (recomendado) | `local` |
| --- | --- | --- |
| Quién contesta | **El Owy de eve** (`agent/`): mismas instrucciones, knowledge, tools, skills, gating de staff y memoria que Slack/Telegram | El modelo realtime con `agent/instructions.md` + knowledge inline + las tools de `agent/tools/*` corridas en el bridge con un shim |
| Memoria entre taps | Una **sesión durable de eve por dispositivo** (`from(deviceId)`): follow-ups con contexto, también por la cascada. Si una cabina muy concurrida nunca queda 3 min en silencio y la sesión llega al tope de tokens del agente (`maxInputTokensPerSession`), el bridge la retira y repite la pregunta en una nueva en vez de quedar trabado en el aviso de aprobación | El historial de la conversación (últimos 6 intercambios) vive en el bridge: la cascada contesta con él y cada sesión realtime nueva (tras un reset o una reconexión: el gateway no reanuda) arranca con él en las instrucciones |
| Fin de la conversación | `COMPANION_EVE_IDLE_RESET_S` (180) sin hablar: se retira la sesión de eve (el próximo visitante arranca de cero) | Igual: se borra el historial y se descarta la sesión realtime |
| Tools en el modelo de voz | `hablar_con_owy` (la conversación), `set_volume`, `show_on_screen` | Todas las de Owy + `propose_talk`, `event_now`, `set_volume`, `show_on_screen` |
| Necesita | `COMPANION_EVE_URL` + `OWY_API_KEY` (la llave del dispositivo, fuera de `eve dev`) | `OWU_API_URL` + `OWY_API_KEY` en el bridge |

Cómo funciona en modo `eve`: el prompt del modelo de voz es `bridge/prompts/voice-of-owy.md`
("sos la voz; todo se lo pasás a `hablar_con_owy` y decís la `respuesta` textual"). Cada turno el
bridge hace `POST /companion/:deviceId/turns` en el canal `agent/channels/companion.ts` con el
texto, `staff` (modo staff del dispositivo) y `marketplaceOpen` (switch del dispositivo), y lee
el stream NDJSON de la sesión: los deltas de eve se muestran como **subtítulos** en el knob mientras
piensa y el texto final es lo que el modelo lee en voz alta (y el subtítulo definitivo). Un tap
cancela también el turno en eve (`/cancel`); tras el silencio, `/reset`. En eve, el turno llega
con `authenticator: companion | companion-staff` (lo que `agent/lib/staff.ts` ya entiende),
`agent/instructions/companion.ts` agrega las reglas de voz (frases cortas, sin markdown, flujo del
mercado de ideas) y `agent/tools/companion.ts` monta `propose_talk` sólo en ese canal (mercado
abierto o staff + cooldown por dispositivo); `event_now` quedó como tool común a todos los canales.
En una sesión web de solo lectura del laboratorio, eve ve un visitante común con el mercado cerrado.

Probar sin hardware: `eve dev --no-ui --port 2000` en `owy/` (con `OWU_API_URL`/`OWY_API_KEY` para
la grilla), el bridge con `COMPANION_EVE_URL=http://127.0.0.1:2000`, y
`scripts/web-turn.mts` (o directo al canal: `curl -X POST localhost:2000/companion/owy-knob/turns
-H 'content-type: application/json' -d '{"text":"qué hay ahora?","marketplaceOpen":true}'` y
`curl -N localhost:2000/companion/sessions/<sessionId>/stream?startIndex=<streamIndex>`; el stream
queda abierto después de `session.waiting`, cortalo vos).

### Modelo realtime

El bridge habla con el modelo por el **AI SDK realtime** (`ai` ≥ 7.0.158): el modelo es un
codec (`serializeClientEvent` / `parseServerEvent`) que `realtime/session.ts` maneja sobre un
`ws` propio, con el token efímero de `experimental_realtime.getToken()`. Es speech-to-speech:
no hay STT/TTS/VAD locales, sólo remuestreo, ritmo y ruteo (`audio/pcm.ts`). Especificación
`COMPANION_REALTIME_MODEL = <proveedor>:<modelo>`:

| Spec | Key | Notas |
| --- | --- | --- |
| `gateway:google/gemini-3.8-live` (default) | `AI_GATEWAY_API_KEY` | Gemini 3.8 Live vía AI Gateway. Audio USD 3 / 12 por M tokens (in/out). El gateway rechaza `turnDetection` y las claves nativas de Gemini (VAD, compresión de contexto): aplican los defaults de Gemini. Sesiones ≤ 25 min, idle 5 min (el bridge mantiene una sesión tibia: reconecta al cerrarse y la renueva a los 20 min), 1er mensaje < 30 s. |
| `gateway:google/gemini-3.8-live-extended-thinking` | idem | Razonamiento en paralelo con la voz; sólo tools `NON_BLOCKING` (el provider manda `thinkingLevel: low`). Más latencia; no probado en el evento. |
| `gateway:openai/gpt-realtime-2` · `gpt-realtime-2.1` · `gpt-realtime-mini` | idem | Respaldo por defecto (`gpt-realtime-2.1`, ver abajo). `voice` de OpenAI (`marin`, `alloy`…). Audio USD 32 / 64 por M tokens (mini: 10 / 20). `turnDetection: server-vad 600 ms`. `gpt-live-1` **no**: GPT-Live es otro protocolo (continuo, server-websocket). |
| `google:gemini-3.8-live` | `GOOGLE_GENERATIVE_AI_API_KEY` | Directo a Google: mismo modelo, sin límite de 25 min, con `automaticActivityDetection` (600 ms), `contextWindowCompression` y `sessionResumption` (`goAway` manejado). `gemini-3.1-flash-live-preview` quedó *legacy*. |

Gemini 3.8 Live sólo responde audio (`outputModalities: ["text"]` es rechazado): el REPL
`companion:text` abre la sesión en audio y muestra la transcripción. Las tools de 3.8 son
asíncronas por defecto (`NON_BLOCKING`); el bridge fija `providerOptions.google.defaultToolBehavior =
"BLOCKING"` en `gemini-3.8-live` para conservar el flujo llamada → resultado → respuesta hablada
en un solo turno (probado vía gateway y directo en `buildSessionConfig`). Con OpenAI y con la
mayoría de las voces de Gemini alcanza `COMPANION_VOICE`; el mic va a 16 kHz al proveedor directo
y a 24 kHz al gateway (`sessionInputRate`), la voz vuelve a 24 kHz y se baja a 16 kHz.

Prueba sin hardware ni navegador: `WEB_TURN_OUT=/tmp/reply.wav node_modules/.bin/tsx
companion/scripts/web-turn.mts /tmp/q.wav` (un turno completo por el transporte web:
transcripciones, tools y el PCM de la respuesta guardado como WAV).

### Respaldos y redes malas

La red del venue es desconocida, así que un tap **nunca se rechaza por el modelo**. Cada turno
elige su camino al aceptarse (y una sesión que muere a mitad de turno lo pasa a la cascada,
una sola vez); la línea `turn path=… ttfa=… total=…` del log dice cuál contestó:

| Camino | Cuándo | Latencia |
| --- | --- | --- |
| `realtime` | Gemini 3.8 Live conectado (la sesión se mantiene tibia entre turnos) | ~2 s |
| `fallback` | Gemini no conecta: `COMPANION_REALTIME_FALLBACKS` (default `gateway:openai/gpt-realtime-2#marin,gateway:spacexai/grok-voice-3.0`; `#voz` elige la voz de cada uno). El AI Gateway no tiene fallbacks para realtime: la sesión prueba los modelos en orden y deja descansar 3 min al que falló | ~2 s |
| `cascade` | Ningún realtime vivo al tocar, el modelo no da señales ~2,5 s después de que la persona calla (`COMPANION_ACK_MS`: socket medio muerto), o el socket se cae mientras escucha. El bridge graba el turno (su propio VAD), lo transcribe con modelos que no retienen datos (`COMPANION_TRANSCRIBE_MODELS`: voxtral, mai-transcribe, grok-stt), contesta (eve, o el modelo de texto con las tools locales; si eve no responde, el cerebro local) y lo dice frase por frase con la voz de Owy (`COMPANION_TTS_MODELS`, Gemini TTS en Kore; la siguiente frase se sintetiza mientras suena la anterior). Si no hay voz de Owy, ElevenLabs en streaming (otra voz) y, si tampoco, el texto en pantalla | ~4–6 s |
| `offline` | Ni eso: el aviso pregrabado `offline` sale por el parlante (sin red) y la pantalla muestra el QR de la grilla | instantáneo |

Si eve no contesta, contesta el cerebro local (el modelo de texto con todas las tools y la charla
hasta ahí) y eve queda en pausa 1 minuto. Si la salida de audio elegida desaparece a mitad de una
respuesta (la PA desenchufada, la pestaña cerrada), el resto sale por el navegador o la placa.
Si el socket se cae mientras Owy ya habla, termina con lo que llegó y deja la respuesta de eve
como subtítulo; si cae mientras eve piensa, la respuesta de eve sale por la voz de la cascada
(nunca se repite un turno que ya ejecutó una tool). `COMPANION_CASCADE=off` vuelve al
comportamiento anterior (rechazar sin modelo). Timeouts: `COMPANION_TOKEN_TIMEOUT_MS` (8 s),
`COMPANION_REALTIME_CONNECT_MS` (12 s por modelo); eve corta a los 25 s (dentro de los 30 s
de "pensando"). En redes LAN con jitter, `COMPANION_PACER_LEAD_MS` (100) sube el colchón de
audio hacia el dispositivo.

- **`pnpm companion:netcheck`** — la mañana del evento, desde la laptop del venue: DNS y HTTPS al
  gateway, token + handshake de cada modelo realtime, transcripción, primer audio de TTS, eve y el
  sitio, con los timeouts vigentes. Sale con código 1 si algo falla.
- **`pnpm companion:clips`** — genera también los avisos `offline` y `retry` (`public/companion-audio/clips`;
  la imagen Docker los copia). Sin ellos esos avisos van como texto en pantalla.
- **Laboratorio de redes malas** (Docker): `docker compose -f owy/companion/bridge/compose.yaml -f
  owy/companion/bridge/compose.netem.yaml up -d --build` y después `pnpm -C owy companion:netem
  q1.wav q2.wav` (WAV 16 kHz mono **grabados por personas**: la transcripción de voces `say` es
  inestable). Un sidecar con `tc netem` degrada sólo la salida a internet del bridge (la LAN y el
  host quedan limpios) en perfiles baseline · congested · bad · terrible · blackhole · flap, y la
  tabla final dice cuántos turnos pasan, por qué camino y con qué latencia.
- El panel de ajustes (`/api/settings`, oRPC `settings.get`) muestra por dispositivo `voice.tier`
  (el modelo realtime conectado), `voice.realtime` y `voice.lastPath`.

### Espejo en la pantalla grande (Owy Stage)

Con `OWY_API_KEY` configurada, cada Owy (gadget o voz del workbench) refleja su cara y
la transcripción de cada turno en el video wall: `bridge/src/stage.ts` manda
`owyStage.setFace` al sitio (estados `listening/thinking/speaking/idle/happy…` y el
texto acumulado, como mucho 4 veces por segundo), el sitio lo difunde por realtime y la
escena **Owy** de `/owy/stage` (se elige en `/admin/owy/scenes`, se embebe en OBS como
browser source 1920×1080) reacciona con los mismos ojos, boca y subtítulos. Sin la key el
espejo queda apagado y el bridge lo avisa una vez al arrancar.

### Cómo funciona un turno

1. Tap (o wake word) → el dispositivo manda `VoiceAssistantRequest{start}`; el bridge
   acepta con `port 0` (audio por la API), manda `RUN_START` + `STT_START` y la cara pasa a *listening*.
2. El micrófono llega en PCM 16 kHz y se reenvía al modelo (`input-audio-append`; a 24 kHz si va por el gateway).
3. La primera transcripción cancela el timeout de silencio para no cortar frases largas.
   Cuando el modelo empieza una tool o respuesta de audio, el bridge
   manda `STT_VAD_END` + `STT_END{text}` (el mic se apaga) y ejecuta las tools localmente.
4. El bridge espera `playback_ready=true`, luego manda `TTS_START` con texto no
   vacío y `TTS_END` con una URL de protocolo (`api://owy/response`, no se descarga).
   **TTS_END es necesario incluso con audio por la API**: pone a ESPHome en
   `STREAMING_RESPONSE`, donde puede detectar el fin de reproducción.
5. El audio del modelo (24 kHz) se remuestrea a 16 kHz y se envía a ritmo real con
   `TTS_STREAM_START` → `VoiceAssistantAudio` → `TTS_STREAM_END` → `RUN_END`.
   La cola no empieza a contar tiempo hasta que el dispositivo está listo.
6. El firmware espera a que terminen la voz y el parlante, reproduce una señal
   suave, espera que el parlante libere el bus y abre otra escucha. Los ojos se
   abren y aparece el mic azul: se puede continuar sin decir "Okay Nabu".
   Tras 8 s sin habla vuelve silenciosamente a wake word (o idle si está desactivado).
   Un tap cancela inmediatamente. Desactivar `Continuous Conversation` en la web
   del dispositivo cierra la ventana; `Listening Chime` permite quitar el tono.
   Ambos switches conservan su preferencia tras reiniciar.

Todo turno termina siempre con `RUN_END` o `ERROR` (un run sin cerrar traba el pipeline del
dispositivo); timeouts: 8 s sin habla, 5 s de TTS sin datos. Si el bridge no
cierra una escucha silenciosa, un guard local del dispositivo la cancela a los
9 s. La detección de habla cancela ese guard para permitir frases largas.

El silencio cierra normalmente con `RUN_END`, sin error rojo ni respuesta hablada.
Rechazo del servidor, cancelación, errores y desconexión recuperan el audio.
Un watchdog de 90 s evita turnos colgados. Las réplicas dentro de la conversación
conservan el contexto de Gemini. Al terminar por silencio o cancelar se descarta
ese contexto y se abre una sesión nueva para el siguiente visitante, evitando
que audio o tools tardíos lleguen a su turno.

Es half-duplex: mientras Owy habla, el micrófono está apagado. Para interrumpir,
tocá la cara; para continuar, esperá el tono y la indicación de escucha.
La continuación explícita del firmware mantiene el flag de ESPHome
`continue_conversation=0`: así no se saltea la señal ni la liberación del bus.

### Verificar audio antes del evento

Con el bridge de Gemini parado, `pnpm companion:audio-check` prueba respuestas
repetidas (incluida una de 20 ms), silencio, rechazo, cancelación al escuchar y al
hablar, activar wake word durante playback, el tono de prueba y reconexión.
También verifica tres respuestas manos libres desde una sola activación, la
ventana real de 8 s, un tono por escucha, desactivar la conversación en curso,
una respuesta de 20 s, escucha sin tono (switch apagado o modo silencioso) y
el guard local dejando deliberadamente de mandar el timeout desde el bridge.
Falla ante contención I2S, buffers llenos o falta de recuperación; espera el evento
de reproducción **del dispositivo**, no sólo bytes enviados desde la laptop.

Para aislar tres respuestas de 20 s: `COMPANION_CHECK_LONG_ONLY=1 pnpm companion:audio-check`.
Para inyectar una pausa TCP equivalente de 700 ms después del pacing, agregá
`COMPANION_CHECK_TRANSPORT_STALL_MS=700`. Es un test de ráfagas, no una garantía
de voz sin cortes ante Wi-Fi malo. No tocar pantalla/BOOT ni reiniciar el bridge
durante la suite; las preferencias se restauran al finalizar.

Después reiniciá `pnpm companion:dev`, decí "Okay Nabu" y hacé tres preguntas,
continuando después del tono sin repetir el wake word. Quedate en silencio
8 s y verificá que vuelva a aceptar "Okay Nabu". Esta prueba acústica no la reemplaza
el test de protocolo. La cara indica cuándo hablar y permite cancelar con un tap;
un long press abre ajustes sin iniciar una conversación al soltar.

### Permisos

- Cualquiera puede preguntar. `propose_talk` (crea la card) sólo funciona con
  `marketplace_open` encendido (o en modo staff) y con 60 s entre propuestas.
- Las tools de staff (mover, borrar, castear, OBS, countdown, tareas, avisos) pasan por el
  mismo `requireStaff` de siempre: el bridge ejecuta con `authenticator: companion`
  (nunca staff) o `companion-staff` (con `switch.staff_mode` encendido). Ver `agent/lib/staff.ts`.
- `digitize_board_photo` no está disponible (necesita el sandbox de eve).

## Checklist del día

- [ ] Router de viaje propio (SSID nuestro, sin aislamiento de clientes, reservas DHCP para las placas) colgado del uplink del venue; hotspot del celular como uplink de respaldo. Si no hay, Wi-Fi del venue 2.4 GHz sin captive portal.
- [ ] `pnpm companion:netcheck` desde la laptop ya en el venue: todo `ok` (o `lento` con los timeouts ajustados).
- [ ] `pnpm -C owy companion:serve` desde Terminal (mantiene la Mac despierta y rearranca el bridge); en **Control**, el bridge «en línea» y cada placa conectada.
- [ ] Permiso "Red local" de macOS habilitado para la terminal desde la que corre el bridge (ver "Primer arranque").
- [ ] `secrets.yaml` con el SSID del venue, reflash OTA la noche anterior.
- [ ] `pnpm companion:tools` y `pnpm companion:text` contra producción: "¿cuándo es la conf?" y una propuesta de prueba (borrarla después).
- [ ] Cara en *idle*, «Tono de prueba» (Control) audible a distancia de uso; «Tono en la Mac» por la PA.
- [ ] Control → modo de cada placa (Conversación · Pitch · Charla) y **Mercado abierto** al empezar el mercado de ideas; apagarlo cuando cierre.
- [ ] Cartel en la mesa: "Tocá o decí Okay Nabu. Seguí después del tono. Mantené para ajustes".
- [ ] Alimentación USB-C; el brillo baja solo a los 2 min sin tocarla.

## Problemas conocidos / próximos pasos

- Half-duplex: el mic se apaga mientras Owy habla (así funciona `voice_assistant`); interrumpir = tap.
- Wake word en español ("Che Owy"): entrenar con microWakeWord + voces Piper `es_AR` (pendiente).
- Anuncios ambientales (bloques, cast) y `ask_owy` (delegar al Owy durable con `eve/client`): fase siguiente.

## Qué está sonando, con Shazam y sin API key (Owy Stage)

La escena **Sonando** (`now-playing`) de la pantalla grande se puede alimentar sola con lo que escucha el micrófono de una Mac, usando el reconocedor de música que trae macOS (Shazam) desde la app Atajos: no hay API key, ni cuota, ni cuenta.

1. En **Atajos**, creá un atajo llamado `OWU Now Playing` con: *Reconocer música* → *Obtener detalles de Shazam Media* (Título) → *Obtener detalles…* (Artista) → un *Texto* con el título en la primera línea y el artista en la segunda. Ejecutalo una vez para darle permiso al micrófono.
2. En la Mac que está cerca de los parlantes: `OWU_API_KEY=… OWU_API_URL=https://owu.uy ./scripts/now-playing-mac.sh`
3. Poné la escena *Sonando* en la pantalla. Cada ~25 s el script escucha y, si el tema cambió, actualiza título y artista (`owyStage.nowPlaying`, autenticado con la misma key del bridge). Con cualquier otra escena al aire el sitio lo ignora, así que puede quedar corriendo todo el día.

Alternativas gratis: en Linux, [SongRec](https://github.com/marin-m/SongRec) (`songrec listen --json`, cliente open-source de Shazam) y el mismo `curl`; 100 % offline, [Olaf](https://github.com/JorenSix/Olaf) (`olaf store` con la playlist y `olaf microphone`).

## La cara (rediseño 2026-10)

Un solo modelo (`firmware/companion_model.h`) calcula cada número animado y
`FaceRenderer` (`companion_lvgl.h`) es el único que escribe geometría LVGL,
deduplicada: sólo se redibuja lo que cambió.

- **Resortes** en vez de saltos: cada estado tiene una pose (ojos, párpados,
  cejas inclinables, cachetes, boca) y los resortes la alcanzan con un poquito
  de rebote. Un parpadeo tapa cada cambio de estado.
- **Boca**: labios + cavidad + lengua + corte (sonrisa en U / ceño) + banda
  superior (risa). Hablando, la forma sale de `SpeechAnalyzer`: volumen →
  apertura, dos cocientes espectrales normalizados a la voz → ancha (e/i) o
  redonda (o/u). Escuchando, la boca queda quieta en «o»: tu voz mueve las
  pupilas y el aro, no los labios de Owy.
- **Aro** (24 puntos, `FaceRing`): azul = vos (escucha, cuenta regresiva del
  follow-up), amarillo = Owy (cometa pensando, respira hablando, volumen/brillo).
- **Dormir**: a los 120 s quieto cierra los ojos y flotan las z 10 s; después
  baja el brillo y LVGL se pausa. Un toque lo despierta.
- Calibración en pantalla: `speaker_latency_ms` (companion.yaml) adelanta los
  labios al audio que sale; `COMPANION_MOUTH_LATENCY_MS` (bridge) hace lo mismo
  para el audio de la laptop. `SpeechAnalyzer::*` tiene los umbrales de vocales.

### Caras mientras habla (jev)

Cada frase de la respuesta lleva una expresión (`neutral · happy · excited ·
curious · thinking · empathetic · playful · surprised`) que el dispositivo
aplica sobre la cara de "hablando" cuando esa frase se escucha: ojos, párpados,
cejas y cachetes cambian; los labios siguen haciendo lip-sync.

- `bridge/src/expression.ts` (`ExpressionDirector`, uno por turno): parte el
  texto en frases (la respuesta de eve apenas llega; con cerebro local, la
  transcripción de Gemini a medida que llega) y le pregunta a **jev**
  (TypeSafe en el AI Gateway, `experimental_evaluate` con una pregunta
  `choice`) qué cara va. Medido: ~0.4–0.7 s por frase, en paralelo, 12/12 en
  frases rioplatenses. Una estimación local instantánea (puntuación y palabras
  como "perdón", "¿…?", "¡…!") cubre cada frase hasta que jev contesta; si jev
  llega tarde corrige la cara en el momento. Confianza baja = expresión suave.
- Lo que dijo la persona (`hablar_con_owy` con eve, la transcripción con
  Gemini) dispara una **reacción** mientras Owy piensa.
- Sincronía: el bridge anota cuánto texto llevaba la transcripción en cada
  tramo de audio encolado y, cuando el pacer suelta ese audio, manda la cara de
  la frase con `lead_ms` (dispositivo 200 ms, navegador 250 ms, audio en la
  laptop `COMPANION_MOUTH_LATENCY_MS`). Sin transcripción estima ~14 caracteres/s.
- Firmware: acción `express(feeling, lead_ms, strength)` →
  `Companion::express`; las señales sólo valen mientras habla o piensa y se
  borran al terminar el turno. El estado de voz (escuchando/pensando/hablando)
  sigue siendo el real.
- Simulador: el mismo comando llega por la conexión en vivo; en el workbench,
  "Expresión al hablar" las prueba con *Hablando* o *Pensando*.
- Privacidad: las frases y lo que dijo la persona van a TypeSafe con
  zero-data-retention del gateway. `COMPANION_EXPRESSIONS=guess` no manda nada.

## Modo pitch (mercado de ideas)

En el mercado de ideas el knob queda en el medio de la sala con el **Modo pitch** prendido (interruptor `pitch_mode`: fila «Modo pitch» en la página de ajustes del dispositivo detrás del PIN, la tarjeta «Owy físico» de `/admin/companion`, o la página de respaldo del bridge en `127.0.0.1:3313`). Mientras está prendido, cada toque arranca un pitch en vez de una conversación. El flujo de una persona, del primer toque a la card, es `bridge/src/pitch-flow.ts`:

1. **Toque** → vibra, el aro parpadea como un REC y (salvo en *Callado*) Owy dice «Te escucho. Contame tu charla y tocá de nuevo cuando termines» (clip pregrabado). La grabación arranca cuando termina el aviso.
2. La persona cuenta la charla (20–60 s, con pausas). **El audio no pasa por el modelo de voz**: su detección de fin de habla cortaría el pitch en la primera pausa. El bridge lo graba (`PitchRecorder`, `bridge/src/pitch.ts`) del micrófono que tenga elegido ese dispositivo (el del knob, el de la Mac o un receptor DJI: ver *Micrófono de la Mac*) y detecta voz con energía (`COMPANION_PITCH_VAD_RMS`).
3. **Toque** (`binary_sensor.pitch_submit`) → doble vibración, cara pensando. Si nadie toca, 10 s de silencio después de hablar (`COMPANION_PITCH_SILENCE_S`) o 2 minutos (`COMPANION_PITCH_MAX_S`) terminan la grabación solos.
4. Una llamada multimodal al gateway (`COMPANION_PITCH_MODEL`, default `google/gemini-3.8-flash`, con `COMPANION_PITCH_FALLBACK_MODELS`) devuelve transcripción + card: `kind` (`pitch` · `unclear` · `not_pitch`), título, speaker si se presentó, tele/pizarra, descripción, temas. Si el modelo de audio no responde, segundo camino: transcripción (`COMPANION_TRANSCRIBE_MODELS`) + el modelo de texto (`COMPANION_TEXT_MODEL`) sobre las palabras. Menos de 2 s de habla o un saludo/prueba → «No escuché una propuesta» y no se crea nada.
5. **Lo que falta se pregunta una vez**: sin tema claro, «¿De qué va tu charla, en pocas palabras?»; sin nombre, «¿Cómo te llamás?». Terminada la pregunta el bridge llama `pitch_prompt("topic" | "name")` y **el knob abre el mic solo** (un run `pitch-answer`; vibra antes, como siempre). La respuesta termina con un toque, 3 s de pausa, o a los 8 s si nadie habla. Una respuesta sólo completa lo que se preguntó (y el nombre, si alguien lo dice); nunca pisa lo que el pitch ya dijo. Sin tema después de preguntar → «No me quedó claro el tema…» y no se crea nada; sin nombre, la card va sin speaker.
6. **Antes de escribir, dos chequeos.** *¿Es apto para la grilla pública?*: la misma llamada que arma la card marca `appropriate` (ofensivo, discriminatorio, sexual, burla o spam → «Esa propuesta no la puedo cargar…», sin preguntar nada; una respuesta ofensiva también cuenta). *¿Ya está en la grilla?*: en cuanto la charla tiene tema, un modelo de decisión (jev; Luna re-decide si jev duda entre 0,35 y 0,8; d1 si falla un proveedor) contesta sí/no por cada card del evento «¿son la misma charla?»; con P ≥ 0,8 Owy dice «Esa charla ya está en la grilla: «…», en Ventana a las 16:00» y muestra esa card en vez de crear otra. Tarda ~0,3–0,6 s y corre mientras Owy pregunta el nombre; si falla, la charla se carga igual (`COMPANION_PITCH_DEDUPE=off` lo apaga).
6. **Una sola escritura**: `tracks.createPlaced` ubica la charla (los mismos modelos de decisión que «Sugerir con AI») y la crea cuando está completa. Si la escritura no contesta claro (timeout, conexión cortada, 5xx), el bridge busca la charla en la grilla antes de reintentar una vez: ni pitch perdido ni duplicado. Grilla llena → «no queda lugar libre; hablá con el staff».
7. Owy confirma según **Owy responde** (`select.pitch_voice`, ver abajo): el knob muestra la card y la pared (`owy-face`) la hace aterrizar; con voz, «¡Listo, Ana! Tu charla «X» queda en Cueva a las 15:00» por el modelo realtime como `[GUION] …` (si no arranca en 2×`COMPANION_ACK_MS`, la voz de la cascada; sin voz, la pantalla).

**Owy responde** (`select.pitch_voice` en el knob — botón «Owy responde» en los ajustes —, la tarjeta «Owy físico» de `/admin/companion`, o `COMPANION_PITCH_VOICE`):

| Nivel | Qué hace |
| --- | --- |
| `Callado` (`silent`) | sin audio: la card en pantalla; las preguntas son el hint del knob («¿cómo te llamás? · tocá al terminar») y el mic se abre igual; los finales sin card van como texto |
| `Confirma` (`confirm`, default) | dice dónde quedó y pregunta lo que falta |
| `Confirma y comenta` (`react`) | además una frase cálida sobre la charla: el cerebro eve escrita en la misma llamada que arma la tarjeta: no suma ni un segundo |

Las frases fijas (te escucho, las dos preguntas, los finales sin card) salen de clips pregrabados (`pnpm companion:clips`): el navegador las reproduce, y por el parlante del knob el bridge manda su PCM (sin red). Las que todavía no están grabadas las dice el modelo.

Interrupciones: un stop durante la grabación del pitch (modo apagado, privacidad) descarta el pitch; después (esperando una respuesta, ubicando la card), lo que ya se entendió se carga igual, sin hablar ni pisar la pantalla. Un pitch que no se pudo entender o cargar se guarda para el staff (WAV + JSON en `$COMPANION_LOG_DIR/pitch-failures/`, sólo si esa variable está puesta); fuera de eso nada se persiste del audio y las llamadas al gateway van con `zeroDataRetention`. El modo pitch no aplica el gate del mercado ni el cooldown de `propose_talk`: el interruptor es la decisión del staff.

- Variables: `COMPANION_PITCH_MODE` / `COMPANION_PITCH_VOICE` (fallbacks para placas sin interruptor/select: lab web, REPL; el viejo `COMPANION_PITCH_REACTS=1` equivale a `react`), `COMPANION_PITCH_MODEL`, `COMPANION_PITCH_FALLBACK_MODELS`, `COMPANION_PITCH_THINKING` (default `low`: medido, la tarjeta baja de 5–7 s a 3–4 s con los mismos resultados), `COMPANION_PITCH_HEDGE_MODEL` / `COMPANION_PITCH_HEDGE_MS` (default `google/gemini-3.5-flash-lite` a los 5 s: si el modelo principal tarda o falla, se le pide también al rápido y gana la primera respuesta), `COMPANION_PITCH_SILENCE_S`, `COMPANION_PITCH_MAX_S`, `COMPANION_PITCH_VAD_RMS`, `COMPANION_PITCH_EVENT_ID`. Necesita `AI_GATEWAY_API_KEY` y `OWY_API_KEY`.
- `pnpm companion:clips` regenera los avisos pregrabados (una vez por cambio de voz o de texto); `pnpm companion:pitch pitch.wav [respuesta.wav …]` prueba el extractor con WAVs: la card, lo que Owy preguntaría y cómo queda con cada respuesta.
- Contrato con el firmware: `switch.pitch_mode`, `select.pitch_voice` (`Callado · Confirma · Confirma y comenta`; placas viejas: `switch.pitch_reacts`), `binary_sensor.pitch_submit` (pulso en el segundo toque), acción `pitch_prompt(kind)` (`topic` | `name` abren el mic para la respuesta; `idle` cancela una pendiente), y el run arranca con `wake_word: "pitch"` (`"pitch-answer"` en una respuesta; el bridge decide igual por su propio estado). En el lab web: `start { mode: "pitch" }` y `commit` como segundo toque; el navegador abre el mic solo para la respuesta al recibir `pitchPrompt`.
- Firmware (`voice.yaml` / `controls.yaml`): en modo pitch `tap_to_talk` va a `tap_pitch` (grabando → `stop_pitch`; libre → `start_listening` con `pitch_active`), que arranca el run con `silence_detection: false`; `pitch_prompt` corre `pitch_answer`, que espera a que termine la pregunta (run cerrado, parlante libre) y abre el mic. El guard local de 9 s no corre y el watchdog del turno pasa a 180 s. Cara `record` (aro REC: el arco azul del mic más el punto de las 6 parpadeando); hints «contá tu charla · tocá al terminar», «¿de qué va tu charla? · tocá al terminar», «¿cómo te llamás? · tocá al terminar», «armando tu tarjeta...». En el Knob la háptica sigue a `pitch_state` (`arming` 1, `sent` 10; `pitch_arm_ms: 320ms` deja morir el buzz antes de abrir el mic) y la card queda en pantalla durante el anuncio. Emulador: fixture «Un pitch en el mercado», toggles «Modo pitch» / «Owy reacciona al pitch» y caras «Grabando» / «Tocá (pitch)» en el lab — todavía con el paso del nombre por toque hasta regenerarlo (`pnpm companion:emulator:generate` + `build`).

### Micrófono de la Mac (DJI o el integrado)

`select.mic_source` también ofrece **`mac`**: el bridge graba una entrada de la Mac donde corre (el micrófono integrado, un receptor DJI Mic 2 por USB-C) con ffmpeg (`avfoundation`, `bridge/src/audio/host-mic.ts`), a 16 kHz mono, igual que el knob. Sirve para el pitch y para conversar.

- **Sólo con el bridge corriendo nativo en macOS** (`pnpm -C owy companion:start`): Docker Desktop corre en una VM sin audio, así que en el contenedor la opción aparece *no disponible*. Necesita `ffmpeg` (`brew install ffmpeg`) y el permiso de **Micrófono** para la app de terminal (Ajustes del Sistema → Privacidad y seguridad → Micrófono); sin permiso llega silencio digital y el bridge lo marca *sin señal*.
- La entrada se elige **por nombre** (`COMPANION_HOST_MIC=DJI` o el nombre exacto, o en la tarjeta «Owy físico» de `/admin/companion`): los índices de avfoundation cambian al enchufar algo y el primero suele ser un mic virtual (Krisp, Teams). Un receptor DJI (Mic 2, Mic Mini) aparece como **«Wireless Microphone RX»** (`DJI` también lo encuentra). Sin nombre: el integrado. `COMPANION_HOST_MIC_CHANNEL` = `L` · `R` · `mix` (default): un receptor DJI en estéreo pone un transmisor por lado; en *safety track* el R es la copia a -6 dB. **Ganancia:** un receptor DJI llega sin AGC, mucho más bajo que el mic del knob (con su silencio casi en cero por la cancelación de ruido): `COMPANION_HOST_MIC_GAIN_DB=12` deja la voz sobre el umbral del pitch sin que el silencio lo cruce (medido: silencio 0,34 %, umbral 1,2 %). Con un solo transmisor, `L` en vez de `mix`: promediar los dos lados baja la voz a la mitad y, si el otro canal trae otra copia, la cancela en parte.
- Queda abierto mientras está elegido (sin latencia al tocar, sin perder la primera palabra) y se reabre solo si ffmpeg muere (desenchufado: 1 → 2 → 5 → 10 s). Si no está sano al empezar un turno, ese turno usa el mic del knob y el log lo dice.
- Ruta: en la placa (`mic_source = mac`, tile «mic en» de los ajustes rápidos o `/admin/companion`; persiste) o `COMPANION_MIC_SOURCE=host` para placas sin el select. Los navegadores (Hablá con Owy, consola de la charla) siguen con su propio mic.
- Chequeo antes del evento: `pnpm -C owy companion:mic-check` lista las entradas; `pnpm -C owy companion:mic-check Wireless --channel L` graba 5 s, dice pico/promedio contra el umbral del pitch y deja `/tmp/owy-mic-check.wav`. `/admin/companion` tiene lo mismo («Grabar 4 s»).

## Charla (Owy, en vivo)

Para la charla del open space Owy co-presenta: la consola `/admin/owy/charla` (en la Mac del lugar) se conecta al bridge como **audio de laptop** del knob (`attach`) y por el mismo socket le manda comandos a ese dispositivo. El knob sigue siendo el gatillo (tap = turno) y su cara; la voz de Owy sale por los parlantes de la Mac.

**Con el sitio en producción.** El sitio en Vercel no llega al bridge de la Mac (loopback), así que no le puede pedir el ticket a `POST /sessions`. En ese caso el sitio firma él mismo un ticket de un solo uso, atado al origen y válido un minuto (`v1.<payload>.<mac>`, HMAC con el secreto compartido) y el bridge lo verifica sin red:

- En Vercel: `COMPANION_BRIDGE_SECRET` (el mismo que el bridge, ≥32 caracteres) y `COMPANION_BRIDGE_PUBLIC_URL=ws://127.0.0.1:3312/voice`, **sin** `COMPANION_BRIDGE_URL` (si está, el sitio sigue pidiendo el ticket al bridge como siempre).
- En el bridge: el mismo `COMPANION_BRIDGE_SECRET` y `COMPANION_WEB_ORIGINS` con el origen del sitio (`https://www.owu.uy`).
- Chrome puede pedir permiso de «red local» la primera vez que una página https abre `ws://127.0.0.1`: aceptalo en el ensayo, no arriba del escenario.

Comandos (`TalkMessageSchema` en `bridge/src/web/contract.ts`; sólo con el navegador ya conectado, si no → `notice`):

- `say { text, clip? }`: Owy dice ese texto tal cual, **sin que nadie toque**. Voz en vivo (`[GUION]`); si el modelo no está o no arranca en ~5 s, el clip grabado (`clip`) y si no hay, la voz de la cascada; como último recurso, el texto en pantalla.
- `ask { text, asker }`: una pregunta en texto (un celular, la consola): el cerebro la responde con sus herramientas y Owy la dice. `asker: "audience"` vale sólo para esa pregunta.
- `hush`: corta lo que Owy esté diciendo o haciendo (un turno del knob, uno propio, un pitch).
- `talk { talk: { slide, asker } | null }`: el contexto de la charla para los turnos que siguen, taps del knob incluidos (`null` = fuera de la charla). Con eve viaja en los atributos del turno (`turn_kind: "talk"`, `talk_slide`, `talk_asker`): instrucciones de escenario y sin `propose_talk`. Con el cerebro local va a las instrucciones (se aplica en la próxima sesión realtime).
- `route { mic?, output? }`, `pitch { mode }`: lo mismo que la UI de ajustes, para ese dispositivo.
- `status` → `{ type: "status", device, talk }` (la fila de ajustes del dispositivo, con `voice.lastTurn` = camino, primera palabra y total del último turno).

Los turnos propios de Owy (`say`, `ask`) no abren un run en el pipeline del dispositivo (ESPHome sólo reproduce dentro de un run que arranca él): eventos y audio van únicamente al navegador (`accepted` llega con `own: true`, sin cue de escucha), y la cara del knob y de la pantalla sigue al turno con `setFace`. Por eso **necesitan la salida en laptop**; con salida en el dispositivo, `notice` de error. En cambio **no necesitan la placa**: si la perilla se cae del wifi (o nunca prendió), las frases y preguntas de la consola salen igual por la Mac y la cara sigue en la pantalla grande; sin placa nadie mantiene tibia la voz, así que la primera frase espera hasta 4 s a que conecte. Un pitch que se está grabando no se corta: `notice` y nada más. Presupuesto: 120 comandos por minuto por socket (un `status` cada 3 s son 20); pasado eso, `notice` de aviso, el socket sigue.

- `COMPANION_PITCH_EVENT_ID` (id o slug): la grilla donde el modo pitch carga las charlas, si no es `OWY_EVENT_ID` (la grilla de prueba de la demo). Las preguntas al cerebro siguen con el evento de eve.
- `pnpm companion:talk-clips [--dry-run]` graba con la voz en vivo cada `say` con `clip` del deck (`src/lib/owy-stage/talk/deck.ts`) en `public/companion-audio/clips/` y suma sus duraciones al `manifest.json` (no pisa los avisos del pitch). Necesita la clave del modelo realtime.
- La pantalla grande recibe, además de la cara, el nombre de la herramienta que corre (`tool` en `owyStage.setFace`; `hablar_con_owy` = el cerebro pensando) para el diagrama en vivo.
