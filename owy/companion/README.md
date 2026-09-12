# Owy Companion — el Owy físico

Un Owy de bolsillo para la mesa del **mercado de ideas** del open space: una
Waveshare **ESP32-S3-Touch-AMOLED-1.75C** (pantalla redonda táctil, dos
micrófonos, parlante) con cara animada que escucha propuestas de charlas,
contesta hablando y las deja en la grilla usando **las mismas tools que el Owy
de Slack/Telegram**.

```
[dispositivo ESPHome]  ──native API (:6053, Noise)──►  [bridge Node en una laptop del venue]
  mics 16 kHz ─┐ voice_assistant                          │  device/esphome.ts  (esphome-client)
  parlante    ─┘ + micro_wake_word                        │  realtime/session.ts ◄── Gemini Live (AI SDK realtime, codec sobre ws)
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
- Una API key de Gemini (`GOOGLE_GENERATIVE_AI_API_KEY`): Gemini Live **no** pasa por el AI Gateway.
- La key de la API del sitio: `pnpm owy:key -- --name companion` en la raíz del repo (una key propia, revocable aparte).

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
| `number.speak_level` | 0–100, mueve la boca |
| `number.volumen` | volumen del parlante |
| `button.tono_de_prueba` | tono suave de prueba de 1 kHz / 80 ms |
| acciones `show_card(title, presenter, room, time_slot)`, `show_qr(url, caption)`, `show_text(body)` | páginas de pantalla |

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

## Bridge

Las variables se leen del entorno o de `owy/.env.local` (el mismo archivo que usa `eve dev`;
gitignoreado). Mínimo para hablar con el dispositivo:

```bash
# owy/.env.local
GOOGLE_GENERATIVE_AI_API_KEY=...
COMPANION_DEVICES=owy-1@owy-companion.local#secrets   # id@host[:port][#psk]; "#secrets" lee api_key de firmware/secrets.yaml
# para las tools de la grilla:
OWU_API_URL=https://owu.uy                             # o http://localhost:3000 con el sitio local
OWY_API_KEY=owy...
OWY_EVENT_ID=owu-conf-2026                             # id o slug; sin esto usa el evento más reciente
```

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

Variables opcionales: `COMPANION_REALTIME_MODEL` (`google:gemini-3.1-flash-live-preview`
por defecto; `gateway:openai/gpt-realtime-2` como plan B con `AI_GATEWAY_API_KEY`),
`COMPANION_VOICE` (`Kore`), `COMPANION_PUBLIC_SITE_URL` (para el QR),
`COMPANION_PROPOSAL_COOLDOWN_S` (60), `COMPANION_MARKETPLACE_OPEN` /
`COMPANION_STAFF_MODE` (fallbacks cuando no hay dispositivo, p. ej. en el REPL),
`COMPANION_LOG_LEVEL`.

### Cómo funciona un turno

1. Tap (o wake word) → el dispositivo manda `VoiceAssistantRequest{start}`; el bridge
   acepta con `port 0` (audio por la API), manda `RUN_START` + `STT_START` y la cara pasa a *listening*.
2. El micrófono llega en PCM 16 kHz y se reenvía a Gemini Live (`input-audio-append`).
3. La primera transcripción cancela el timeout de silencio para no cortar frases largas.
   Cuando Gemini empieza una tool o respuesta de audio, el bridge
   manda `STT_VAD_END` + `STT_END{text}` (el mic se apaga) y ejecuta las tools localmente.
4. El bridge espera `playback_ready=true`, luego manda `TTS_START` con texto no
   vacío y `TTS_END` con una URL de protocolo (`api://owy/response`, no se descarga).
   **TTS_END es necesario incluso con audio por la API**: pone a ESPHome en
   `STREAMING_RESPONSE`, donde puede detectar el fin de reproducción.
5. El audio de Gemini (24 kHz) se remuestrea a 16 kHz y se envía a ritmo real con
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

- [ ] Wi-Fi del venue 2.4 GHz sin captive portal; si no, hotspot del celular para el dispositivo **y** la laptop.
- [ ] Permiso "Red local" de macOS habilitado para la terminal desde la que corre el bridge (ver "Primer arranque").
- [ ] `secrets.yaml` con el SSID del venue, reflash OTA la noche anterior.
- [ ] `pnpm companion:tools` y `pnpm companion:text` contra producción: "¿cuándo es la conf?" y una propuesta de prueba (borrarla después).
- [ ] Bridge corriendo en la laptop, cara en *idle*, tono de prueba audible a distancia de uso.
- [ ] PIN → **Mercado abierto** al empezar el mercado de ideas; apagarlo cuando cierre.
- [ ] Cartel en la mesa: "Tocá o decí Okay Nabu. Seguí después del tono. Mantené para ajustes".
- [ ] Alimentación USB-C; el brillo baja solo a los 2 min sin tocarla.

## Problemas conocidos / próximos pasos

- Half-duplex: el mic se apaga mientras Owy habla (así funciona `voice_assistant`); interrumpir = tap.
- Wake word en español ("Che Owy"): entrenar con microWakeWord + voces Piper `es_AR` (pendiente).
- Anuncios ambientales (bloques, cast) y `ask_owy` (delegar al Owy durable con `eve/client`): fase siguiente.
