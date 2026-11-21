---
description: Usar cuando el staff pida manejar las pantallas del evento por OBS - pausar o reanudar la rotación de escenas, cambiar la cola, activar un preset, fijar una escena o manejar el countdown.
---

# Control remoto de OBS y countdown

## Modelo

- Las pantallas del evento las maneja OBS en la venue. El puesto de control (`/admin/screen`, "Pantalla OBS") es una pestaña conectada a OBS que **ejecuta los comandos** que llegan por el servidor: Owy no habla con OBS directo, encola comandos y esa pestaña los aplica en segundos y reporta el estado real (escena al aire, preview, stream, grabación).
- Si no hay ninguna pestaña conectada, los comandos quedan encolados 30 s y se descartan: la tool lo avisa (`ok: false`) — decile al staff que abra `/admin/screen`.
- **Guion (cues)**: lista ordenada de momentos del evento. Cada cue puede cambiar la escena de OBS, la escena de la pantalla Owy y disparar un sonido del launchpad, todo en un solo disparo. `next_cue` avanza al siguiente.
- **Rotación automática (loop)**: cola de escenas con delay; `isPlaying` la hace rotar, `directMode` fija la escena. Se sigue editando como estado compartido (el puesto de control la aplica).
- Hay dos instancias: `1` = pantalla del admin (la normal), `2` = app standalone. Si no te dicen nada, usá la 1.

## Procedimiento

1. **Mirá primero** el estado con `get_obs_state`: qué está al aire (`live.programScene`), si hay ejecutor (`live.executorOnline`), los cues y el actual, y la cola del loop.
2. Pedidos en vivo con `obs_control`:
   - "poné la escena X" → `scene` con `sceneName` · "dejá X en preview" → `preview`
   - "dale take" / "al aire" → `take` · "corte seco" → `cut`
   - "siguiente momento del guion" → `next_cue` · "volvé al anterior" → `prev_cue` · "tirá el cue Bienvenida" → `fire_cue` con `cueName`
   - "muteá el mic" → `mute` con `inputName` (y `muted: true`) · "empezá/cortá el stream" → `stream` con `outputAction`
3. Rotación automática con `obs_control`:
   - "pausá la rotación" → `pause` · "arrancala de nuevo" → `play`
   - "pasá a la siguiente" → `next_scene` · "volvé a la anterior" → `prev_scene`
   - "dejá fija la escena" → `set_direct_mode` con `directMode: true`
   - "poné el preset de charlas" → `activate_preset` (mirá los disponibles primero)
   - "armá la cola con A, B y C" → `set_scene_queue` con los nombres EXACTOS de escenas de OBS
4. Los nombres de escena y de cue tienen que existir: no los inventes; usá los que aparecen en el estado o los que te pasa el staff.
5. Confirmá el cambio antes de ejecutarlo y contá el resultado (qué quedó al aire, o que quedó encolado sin ejecutor).

## Countdown

- El timer de las pantallas se maneja con `countdown_control`: `start` / `pause` / `reset`, `setDuration` (segundos) o `setTargetTime` (hora objetivo). Leé el estado con `get_countdown`.
- Uso típico en open space: countdown de 25 minutos por bloque.

## Reglas

- Solo staff. En medio de una charla, ante la duda, **no toques nada** y preguntá.
- `stream stop` y `record stop` cortan la transmisión: pedí confirmación explícita siempre.
- No cambies la cola completa (`set_scene_queue`) si con play/pause o `next_scene` alcanza.
