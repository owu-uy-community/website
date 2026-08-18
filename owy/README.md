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
           (src/lib/realtime/broadcast.ts, sobre su WebSocket propio) → grilla
           admin / kiosk / pantalla OBS se actualizan en vivo, venga el cambio
           de donde venga
```

> El sitio es **multi-tenant** (comunidades × eventos). Owy opera un evento a la vez:
> el de `OWY_EVENT_ID`, o el más reciente si no está seteado.

- **Conocimiento estático** (evento, comunidad, FAQ): `agent/sandbox/workspace/knowledge/*.md` — editá esos markdown para actualizar lo que Owy sabe.
- **Datos en vivo** (grilla, OBS, countdown, stats): tools en `agent/tools/`.
- **Fotos → grilla**: el staff manda una foto de la card física y `digitize_board_photo` la pasa por el OCR del sitio + sugerencia de lugar; la creación siempre se confirma y va por `create_track`.
- **Permisos**: cualquiera puede preguntar; escribir (grilla/OBS/countdown), stats y OCR es **solo staff** (allowlist por env + aprobación humana con botones en el chat; borrar pide aprobación siempre).
- **Persona**: `agent/instructions.md` (rioplatense, amable, no inventa datos).

## Variables de entorno

Crear `owy/.env.local` para desarrollo (y cargar las mismas en el proyecto Vercel):

```bash
# --- Modelo ---
# Local: API key del Vercel AI Gateway. En Vercel no hace falta (OIDC del proyecto).
AI_GATEWAY_API_KEY=

# --- API de OWU ---
OWU_API_URL=https://owu.uy            # local: http://localhost:3000
OWY_API_KEY=                          # API key de Better Auth; se emite en el sitio con `pnpm owy:key`
OWY_EVENT_ID=                         # id o slug del evento que maneja Owy (el sitio es multi-tenant).
                                      # Sin esto usa el evento más reciente que puede operar.

# --- Slack (app portable) ---
SLACK_BOT_TOKEN=                      # xoxb-...
SLACK_SIGNING_SECRET=

# --- Telegram ---
TELEGRAM_BOT_TOKEN=                   # de @BotFather
TELEGRAM_WEBHOOK_SECRET_TOKEN=        # secreto propio, se registra en setWebhook
TELEGRAM_BOT_USERNAME=owy_bot

# --- Staff (IDs separados por coma) ---
OWY_STAFF_SLACK_IDS=                  # member IDs de Slack (U0123ABC,U0456DEF)
OWY_STAFF_TELEGRAM_IDS=               # user IDs numéricos de Telegram

# --- Canal HTTP de eve (TUI remota / curl) — cuenta como staff ---
ROUTE_AUTH_BASIC_USER=
ROUTE_AUTH_BASIC_PASSWORD=
```

### Cómo se autentica Owy

Owy usa el **plugin `apiKey` de Better Auth**: manda su key en el header `x-api-key` y el sitio la resuelve a una sesión normal de la cuenta del bot (`owy-bot`, rol `admin`). No hay auth a medida: la API autoriza a Owy como a cualquier otro usuario, y sus escrituras quedan firmadas con su nombre (los avisos al staff aparecen como "Owy").

Emitir la key **en el sitio** (crea la cuenta del bot si no existe y la imprime una sola vez):

```bash
pnpm owy:key                     # o: pnpm owy:key -- --name "owy prod"
# → OWY_API_KEY=owy...
```

Copiás ese valor al `OWY_API_KEY` del proyecto de Owy. El sitio **no** necesita ninguna variable nueva: la key vive hasheada en la tabla `apikey`.

**Revocar**: deshabilitá (`enabled = false`) o borrá la fila en `apikey` — sin redeploy. Emitir una key nueva no invalida las viejas; borralas si querés rotar. Las keys tienen rate limit (240 req/min) y quedan con registro de último uso.

## Desarrollo local

> **Owy instala aparte del sitio.** No es parte del workspace pnpm de la web:
> eve necesita **Node >= 24** y el sitio buildea en Node 22, así que con
> `engine-strict=true` un único workspace rompía el install de la web. Owy tiene
> su propio `pnpm-workspace.yaml` y su propio lockfile.

```bash
# --- en la raíz del repo (el sitio; db docker en :5433) ---
pnpm install
pnpm owy:key            # una vez: crea la cuenta del bot e imprime su OWY_API_KEY
pnpm dev                # la API en :3000
pnpm dev:realtime       # (otra terminal) para ver los cambios en vivo en las pantallas

# --- en owy/ (el agente, con su propio install) ---
cd owy
pnpm install
OWU_API_URL=http://localhost:3000 OWY_API_KEY=owy... pnpm dev   # TUI de eve
```

En la TUI local sos `local-dev` → contás como staff: podés probar todo (grilla, OBS, countdown, stats). Smoke test sugerido:

1. "¿cuándo y dónde es la conf?" → responde desde knowledge, tono rioplatense.
2. "mostrame la grilla" → llama `get_openspace_board`.
3. "mové «X» a la Cueva a las 15:30" → botón de aprobación → mueve y avisa; con la grilla admin abierta en el navegador se ve moverse en vivo (el broadcast lo emite el sitio server-side; en local necesitás el sidecar de realtime del sitio corriendo).
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
2. **OAuth & Permissions → Bot Token Scopes**: `app_mentions:read`, `chat:write`, `im:history` (DMs), `files:read` (fotos para digitalizar cards), y para hilos sin re-mención: `channels:history` (+ `groups:history` si se usa en canales privados).
3. Instalar la app en el workspace → copiar **Bot User OAuth Token** → `SLACK_BOT_TOKEN`. De **Basic Information** copiar el **Signing Secret** → `SLACK_SIGNING_SECRET`.
4. **Event Subscriptions** → Request URL: `https://<owy-domain>/eve/v1/slack` → suscribir `app_mention` y `message.im` (+ `message.channels` para hilos).
5. **Interactivity & Shortcuts** → misma URL (para los botones de aprobación).
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

### IDs de staff

- **Slack**: perfil del usuario → ⋯ → *Copy member ID* (`U…`). Cargarlos en `OWY_STAFF_SLACK_IDS`.
- **Telegram**: cada uno le escribe a [@userinfobot](https://t.me/userinfobot) (o similar) para conocer su ID numérico. Cargarlos en `OWY_STAFF_TELEGRAM_IDS`.

## Anuncios proactivos (pendiente)

Owy **no** tiene crons hoy. Había tres (`apertura`, `bloques`, `cierre` en
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

## Mantener el conocimiento

- Editar `agent/sandbox/workspace/knowledge/*.md` (hay `<!-- TODO confirmar -->` marcando datos pendientes: link de inscripción, estacionamiento/accesibilidad).
- Regla de oro: **nada interno** en knowledge (ni mails, ni números de ventas, ni presupuestos) — eso vive detrás de `event_stats` (solo staff).
- Redeploy tras editar (`eve deploy` o push).

## Realtime

Owy no habla con el transporte de realtime: desde que el sitio emite los broadcasts **server-side** en sus services de escritura (`src/lib/realtime/broadcast.ts`, sobre el WebSocket propio del sitio), cualquier escritura por API — del admin, de Owy o de un script — notifica sola a la grilla admin, el kiosk y las pantallas de OBS. No requiere configuración extra en owy; del lado del sitio aplica lo de siempre (`REDIS_URL` para el backplane en producción, sidecar `pnpm dev:realtime` en local).
