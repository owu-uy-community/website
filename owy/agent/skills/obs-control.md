---
description: Usar cuando el staff pida manejar las pantallas del evento por OBS - pausar o reanudar la rotación de escenas, cambiar la cola, activar un preset, fijar una escena o manejar el countdown.
---

# Control remoto de OBS y countdown

## Modelo

- Las pantallas del evento las maneja OBS en la venue. El navegador del puesto de control está conectado a OBS y **sincroniza contra un estado compartido** (cola de escenas, play/pause, presets) que vive en la base del sitio.
- Owy no habla con OBS directo: **edita ese estado compartido** vía API y las pantallas lo aplican al toque (las tools emiten el broadcast de realtime).
- Hay dos instancias: `1` = pantalla del admin (la normal), `2` = app standalone. Si no te dicen nada, usá la 1.
- La rotación: la cola es una lista ordenada de escenas de OBS con un delay en segundos cada una. `isPlaying` la hace rotar; `directMode` fija la escena actual sin rotar.

## Procedimiento

1. **Mirá primero** el estado con `get_obs_state`: qué escena está al aire, qué hay en la cola, qué presets existen.
2. Para pedidos simples usá `obs_control`:
   - "pausá la rotación" → `pause` · "arrancala de nuevo" → `play`
   - "pasá a la siguiente escena" → `next_scene` · "volvé a la anterior" → `prev_scene`
   - "dejá fija la escena" → `set_direct_mode` con `directMode: true`
   - "poné el preset de charlas" → `activate_preset` con el nombre (mirá los disponibles primero)
   - "armá la cola con A, B y C" → `set_scene_queue` con los nombres EXACTOS de escenas de OBS
3. Los nombres de escena tienen que existir en OBS: no los inventes; usá los que aparecen en el estado o los que te pasa el staff.
4. Confirmá el cambio antes de ejecutarlo y contá el resultado (escena al aire, cola resultante).

## Countdown

- El timer de las pantallas se maneja con `countdown_control`: `start` / `pause` / `reset`, `setDuration` (segundos) o `setTargetTime` (hora objetivo). Leé el estado con `get_countdown`.
- Uso típico en open space: countdown de 25 minutos por bloque.

## Reglas

- Solo staff. En medio de una charla, ante la duda, **no toques nada** y preguntá.
- No cambies la cola completa (`set_scene_queue`) si con play/pause o `next_scene` alcanza.
