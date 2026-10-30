# 🧉 Owy — la mascota de OWU, como agente

Owy es el asistente durable de la **OWU Conf** y la comunidad OWU, construido con [Eve](https://eve.dev). Responde preguntas de asistentes y staff por **Slack** y **Telegram**, y le permite al staff **gestionar la grilla del open space** y **controlar OBS/countdown** remotamente, hablando con la API oRPC de owu.uy.

## Arquitectura

```
Slack / Telegram / HTTP (eve TUI)
        │  webhooks /eve/v1/*
        ▼
   owy (Eve agent, proyecto Vercel propio)
        │  tools tipadas (@orpc/client + x-api-key)
        ▼
   owu.uy  /api/orpc  (openSpaces · schedules · rooms · tracks · obsQueue · countdown · ocr · dashboard · eventbrite)
        │
        └─ el SITIO emite broadcasts server-side tras cada escritura
           (servicio Realtime de src/lib/orpc, sobre su WebSocket propio) → grilla
           admin / kiosk / pantalla OBS se actualizan en vivo, venga el cambio
           de donde venga
```

> El sitio es **multi-tenant** (comunidades × eventos). Owy opera un evento a la vez:
> el de `OWY_EVENT_ID`, o el más reciente si no está seteado.

- **Conocimiento estático** (evento, comunidad, FAQ): `agent/sandbox/workspace/knowledge/*.md` — editá esos markdown para actualizar lo que Owy sabe.
- **Datos en vivo** (grilla, OBS, countdown, stats): tools en `agent/tools/`.
- **Fotos → grilla**: el staff manda una foto de la card física y `digitize_board_photo` la pasa por el OCR del sitio + sugerencia de lugar; la creación siempre se confirma y va por `create_track`.
- **Permisos**: cualquiera puede preguntar; escribir (grilla/OBS/countdown/tareas/avisos), stats y OCR es **solo staff** (lo decide el sitio con los roles de la persona — por su usuario de Slack o su Telegram vinculado —; quien no puede queda denegado antes de que la tool corra, y la API lo vuelve a chequear en cada llamada). Las acciones se ejecutan directo: **no** hay botones de "Approve tool call" (ver `lib/staff.ts` si se quieren volver a activar).
- **Botones de pregunta**: para desambiguar ("¿cuál de estas tres cards?") o confirmar algo irreversible ("¿borro «X»?"), Owy usa la tool `ask_question` de eve, que Slack dibuja como botones y Telegram como teclado. Siempre con `allowFreeform`, así también se puede contestar escribiendo.
- **Persona**: `agent/instructions.md` (rioplatense, amable, no inventa datos).

## Variables de entorno

Crear `owy/.env.local` para desarrollo (y cargar las mismas en el proyecto Vercel):

```bash
# --- Modelo ---
# Local: API key del Vercel AI Gateway. En Vercel no hace falta (OIDC del proyecto).
AI_GATEWAY_API_KEY=

# --- API de OWU ---
OWU_API_URL=https://owu.uy            # local: http://localhost:3000
OWY_API_KEY=                          # llave de la cuenta de servicio de Owy; se emite en el sitio (`pnpm owy:key` o /admin/acceso)
OWY_EVENT_ID=                         # id o slug del evento que maneja Owy (el sitio es multi-tenant).
                                      # Sin esto usa el evento más reciente que puede operar.

# --- Slack (app portable) ---
SLACK_BOT_TOKEN=                      # xoxb-...
SLACK_SIGNING_SECRET=

# --- Telegram ---
TELEGRAM_BOT_TOKEN=                   # de @BotFather
TELEGRAM_WEBHOOK_SECRET_TOKEN=        # secreto propio, se registra en setWebhook
TELEGRAM_BOT_USERNAME=owy_bot

# Quién es staff ya NO va acá: son roles en el sitio (owu.uy/admin/acceso). El canal HTTP de eve y
# el del Owy físico (/companion/*) piden una llave de OWU con `owy:operate` (header `x-api-key` o
# `Authorization: Bearer`), que el sitio verifica: revocarla allá cierra el acceso acá.

# --- Owy físico ---
COMPANION_PROPOSAL_COOLDOWN_S=60      # segundos entre propuestas de un mismo dispositivo (no staff)

# --- Semanario OWU (cron de los lunes) ---
OWY_SEMANARIO_EMOJI=semanario         # reacción (sin dos puntos) con la que la gente nomina hilos
OWY_JOBS_CHANNEL_ID=                  # id del canal de búsquedas (C0123ABC); vacío = el número no las cuenta
```

### Cómo se autentica Owy

Owy usa el **plugin `apiKey` de Better Auth**: manda su llave en el header `x-api-key` y el sitio la resuelve a la **cuenta de servicio** `owy-bot` (rol `service`), con los permisos de la llave como techo.

**Actúa por la persona.** Cada llamada que hace por alguien lleva quién es (`x-owu-actor: slack:U…`, `telegram:…` o `anonymous` en el kiosco del Owy físico) y la API autoriza a **esa persona**, nunca más que la llave: alguien del staff puede mover charlas por Owy; un asistente, no; cualquiera puede reportar un incidente. Lo que hace queda en la auditoría del sitio a nombre de la persona, "vía Owy". Sin persona detrás (la consola del operador, el Owy físico desbloqueado con su PIN, el cron del semanario) decide la llave.

**Telegram**: Owy reconoce a alguien por Telegram cuando lo vinculó: en owu.uy/acceso → «Vincular Telegram» y le manda `/vincular <código>` a Owy (tool `link_telegram`).

Emitir la llave **en el sitio** (crea la cuenta de servicio si no existe, vence en un año y se imprime una sola vez), o desde /admin/acceso → Llaves API:

```bash
pnpm owy:key                     # o: pnpm owy:key -- --name "owy prod" --days 180
pnpm auth:key -- --owner owy-operador --preset owy-operator --name "consola de Owy"   # para el canal HTTP de eve
```

Copiás la llave al `OWY_API_KEY` del proyecto de Owy. **Revocar**: /admin/acceso → Llaves API (o borrar la fila en `apikey`) — sin redeploy.

## Desarrollo local

> **Owy instala aparte del sitio.** No es parte del workspace pnpm de la web:
> eve necesita **Node >= 24** y el sitio buildea en Node 22, así que con
> `engine-strict=true` un único workspace rompía el install de la web. Owy tiene
> su propio `pnpm-workspace.yaml` y su propio lockfile.

```bash
# --- en la raíz del repo (el sitio; db docker en :5433) ---
pnpm install
pnpm owy:key            # una vez: crea la cuenta de servicio del bot e imprime su OWY_API_KEY
pnpm dev                # la API en :3000
pnpm dev:realtime       # (otra terminal) para ver los cambios en vivo en las pantallas

# --- en owy/ (el agente, con su propio install) ---
cd owy
pnpm install
OWU_API_URL=http://localhost:3000 OWY_API_KEY=owy... pnpm dev   # TUI de eve
pnpm exec eve dev --no-ui --port 2000                             # sin TUI (p. ej. como cerebro del Owy físico)
pnpm exec eve invoke --url http://127.0.0.1:2000 "qué es OWU?"    # un turno desde la terminal
```

eve está en **0.63** (`eve build` limpio; evals con `t.judge(...)` y el evaluador
`typesafe-ai/jev` del gateway — los graders `autoevals` ya no existen). Al subir
de versión, revisar el CHANGELOG del paquete: los saltos suelen traer breaking
changes en tools de fondo (`defineWorkflowTool`), entrypoints `eve/tools/*` y
evals.

En la TUI local sos `local-dev` → contás como staff: podés probar todo (grilla, OBS, countdown, stats). Smoke test sugerido:

1. "¿cuándo y dónde es la conf?" → responde desde knowledge, tono rioplatense.
2. "mostrame la grilla" → llama `get_openspace_board`.
3. "mové «X» a la Cueva a las 15:30" → confirma y mueve; con la grilla admin abierta en el navegador se ve moverse en vivo (el broadcast lo emite el sitio server-side; en local necesitás el sidecar de realtime del sitio corriendo).
4. "pausá la rotación de OBS" → `obs_control` → versión sube y la pantalla admin lo toma.
5. Adjuntá una foto de una card física + "cargala en la grilla" → `digitize_board_photo` extrae los datos y sugiere lugar → confirmás → `create_track`.

Chequeos (desde `owy/`): `pnpm typecheck` · `pnpm build` (eve build) · `pnpm eval` (evals, necesita modelo configurado).

## Deploy (proyecto Vercel propio)

1. En Vercel: **Add New Project** sobre este repo con **Root Directory = `owy`** (Framework: Other; el build usa `eve build` vía el script `build`). Alternativa CLI: `cd owy && eve link && eve deploy`.
2. Emitir la key contra la base de producción del sitio (`pnpm owy:key` con el `DATABASE_URL` de prod) y cargarla como `OWY_API_KEY` junto al resto de las variables de arriba.
3. Verificar salud: `curl https://<owy>.vercel.app/eve/v1/health`.
4. (Opcional) dominio: `owy.owu.uy`.

> El proyecto del sitio no necesita variables nuevas; sí requiere la tabla `apikey` (ya está en el schema de Drizzle: `pnpm db:push` / `db:migrate` al desplegar).

### Slack (app portable)

1. Crear app en https://api.slack.com/apps → **From scratch**, workspace de OWU.
2. **OAuth & Permissions → Bot Token Scopes**: `app_mentions:read`, `chat:write`, `im:history` (DMs), `files:read` (fotos para digitalizar cards), y para hilos sin re-mención: `channels:history` (+ `groups:history` si se usa en canales privados). Para el Semanario: `channels:read` (además de `channels:history`).
3. Instalar la app en el workspace → copiar **Bot User OAuth Token** → `SLACK_BOT_TOKEN`. De **Basic Information** copiar el **Signing Secret** → `SLACK_SIGNING_SECRET`.
4. **Event Subscriptions** → Request URL: `https://<owy-domain>/eve/v1/slack` → suscribir `app_mention` y `message.im` (+ `message.channels` para hilos).
5. **Interactivity & Shortcuts** → misma URL. **Necesario**: sin esto los botones de `ask_question` se dibujan pero al tocarlos no pasa nada (Slack no tiene a dónde mandar el click). Mientras no esté, la gente puede igual contestar escribiendo la opción.
6. Invitar a `@Owy` a los canales donde deba responder.

> Alternativa recomendada por eve si se prefiere no manejar tokens: **Vercel Connect** (`vercel connect create slack --name owy --triggers` + `connectSlackCredentials("slack/owy")` en `agent/channels/slack.ts`). Requiere permisos de admin en el workspace.

### Telegram

1. Crear el bot con [@BotFather](https://t.me/BotFather) (`/newbot`) → token → `TELEGRAM_BOT_TOKEN`. Username del bot → `TELEGRAM_BOT_USERNAME`.
2. Elegir un secreto (`openssl rand -hex 16`) → `TELEGRAM_WEBHOOK_SECRET_TOKEN`.
3. Registrar el webhook (una sola vez, con el deploy ya arriba):

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<owy-domain>/eve/v1/telegram",
       "secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'",
       "allowed_updates":["message","callback_query"]}'
```

4. En grupos, Owy responde a `/comandos`, menciones `@owy_bot` o respuestas a sus mensajes. En privado responde siempre. (La privacidad de grupos se maneja en BotFather.)

### Quién es staff

Lo deciden los roles del sitio: alguien con un rol que permite la acción (por ejemplo staff de OWU para la grilla, o editor de la comunidad para las tareas) puede pedírsela a Owy. Se dan en **owu.uy/admin/acceso** (o en el Equipo de cada comunidad) y piden el Slack de OWU. Por Telegram, la persona primero vincula su cuenta (ver arriba).

## Semanario OWU (cron de los lunes)

`agent/schedules/semanario.ts` corre los **lunes a las 12:00 UTC** (09:00 en Montevideo; en Hobby puede llegar hasta una hora tarde, da igual para un borrador). Carga la skill `semanario`, junta lo de la semana con `collect_semanario` y deja el borrador en el sitio con `save_semanario_draft`. **Nunca publica**: el sitio rechaza `semanario.publish` desde una API key, y una persona del staff lo revisa y lo publica en `owu.uy/admin/semanario`. El staff también puede pedírselo a mano ("Owy, armá el semanario").

Qué lee y cómo:

- **Hilos**: mensajes de primer nivel de los últimos 7 días, en los **canales públicos donde está Owy** (para sumar o sacar un canal, invitá o sacá a `@Owy`), que tengan la reacción `:semanario:` (o la de `OWY_SEMANARIO_EMOJI`). Se ordenan por cantidad de marcas. Owy ve solo un extracto de 200 caracteres para escribir un título propio de una línea; el mensaje no se guarda ni se publica, y las menciones llegan como "@alguien".
- **Búsquedas**: cuántos mensajes nuevos hubo en `OWY_JOBS_CHANNEL_ID`.
- **Agenda**: los eventos de la semana del feed de meetup-bot (la misma fuente que el sitio).

Para activarlo:

1. Scopes extra de la app de Slack: `channels:read` (listar canales públicos) y `channels:history` (ya está si se usan hilos). Reinstalar la app después de agregarlos.
2. Crear el emoji custom `:semanario:` en el workspace (o poner en `OWY_SEMANARIO_EMOJI` uno que ya exista, como `star`).
3. Cargar `OWY_JOBS_CHANNEL_ID` y redeployar: el cron aparece en **Settings → Cron Jobs** del proyecto.
4. En el sitio, la tabla `semanario_issues` tiene que existir en la base (`pnpm db:push`).

Probarlo local sin esperar al lunes: `curl -X POST http://localhost:2000/eve/v1/dev/schedules/semanario`.

## Anuncios proactivos (pendiente)

Owy no tiene otros crons hoy (además del Semanario). Había tres (`apertura`, `bloques`, `cierre` en
`agent/schedules/conf-day/`) pero el plan Hobby de Vercel sólo permite crons
**una vez por día** y con precisión de **±59 minutos**, así que el anunciador de
bloques (cada 30') no deploya y los otros dos podrían llegar hasta una hora tarde.

Para recuperarlos antes del evento hay dos caminos:

1. **Pasar el proyecto a Pro** — vuelven tal cual estaban (precisión al minuto).
   Los archivos están en el historial: `git show 5ff3597 -- owy/agent/schedules`.
2. **Un solo cron diario que se auto-marque el ritmo** — arranca 14:30 y la
   sesión (durable) duerme entre anuncios con la tool `sleep` de eve. Entra en
   Hobby y evita el ±59' salvo en el disparo inicial.

Mientras tanto Owy responde igual a demanda en Slack y Telegram.

## Owy físico (companion)

Hay dos Owys físicos para la mesa del mercado de ideas (Waveshare AMOLED 1.75C y
Knob 1.8B) con cara animada que escuchan y hablan a través de un bridge Node con
un modelo realtime (Gemini 3.8 Live vía AI Gateway). **El cerebro es este agente**:
el bridge manda cada turno al canal `agent/channels/companion.ts` (una sesión
durable de eve por dispositivo) y el modelo de voz sólo pronuncia la respuesta.
`agent/instructions/companion.ts` agrega el "modo voz" a esos turnos y
`agent/tools/companion.ts` monta `propose_talk` (mercado de ideas) sólo ahí; el
turno llega con `authenticator: companion | companion-staff` para el gating de
staff. Rutas: `POST /companion/:deviceId/turns`, `GET /companion/sessions/:id/stream`,
`POST /companion/:deviceId/{cancel,reset}`, protegidas con la llave de OWU del
dispositivo (`x-api-key`, preset `companion`; loopback libre en `eve dev`). Firmware ESPHome + bridge + runbook en
[`companion/README.md`](companion/README.md); scripts `pnpm companion:*`.

## Mantener el conocimiento

- Editar `agent/sandbox/workspace/knowledge/*.md` (hay `<!-- TODO confirmar -->` marcando datos pendientes: link de inscripción, estacionamiento/accesibilidad).
- Regla de oro: **nada interno** en knowledge (ni mails, ni números de ventas, ni presupuestos) — eso vive detrás de `event_stats` (solo staff).
- Redeploy tras editar (`eve deploy` o push).

## Realtime

Owy no habla con el transporte de realtime: desde que el sitio emite los broadcasts **server-side** en sus services de escritura (el servicio `Realtime` de `src/lib/orpc/services.ts`, sobre el WebSocket propio del sitio), cualquier escritura por API — del admin, de Owy o de un script — notifica sola a la grilla admin, el kiosk y las pantallas de OBS. No requiere configuración extra en owy; del lado del sitio aplica lo de siempre (`REDIS_URL` para el backplane en producción, sidecar `pnpm dev:realtime` en local).
