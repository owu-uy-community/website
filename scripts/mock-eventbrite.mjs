/**
 * A fake Eventbrite for developing and testing Organizá's integration without an Eventbrite app:
 * the OAuth pages (authorize approves at once), and enough of API v3 to connect an account,
 * publish an event (venue → event → ticket class → description → publish), cancel it and read
 * its attendees. Point the app at it with
 *
 *   EVENTBRITE_API_URL=http://127.0.0.1:4477/v3
 *   EVENTBRITE_OAUTH_URL=http://127.0.0.1:4477/oauth
 *   EVENTBRITE_CLIENT_ID=mock EVENTBRITE_CLIENT_SECRET=mock
 *
 *   node scripts/mock-eventbrite.mjs     # http://127.0.0.1:4477
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_EVENTBRITE_PORT ?? 4477);
const TOKEN = "mock-eventbrite-token";
const origin = `http://127.0.0.1:${PORT}`;

let nextId = 1000;
/** Events created here, by id: their name, content version and whether they're live. */
const created = new Map();

const json = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const readBody = async (request) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw;
};

const routes = [
  [
    "GET",
    /^\/oauth\/authorize$/,
    (_, response, url) => {
      // Approves at once, like an organizer clicking "Allow"
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", "mock-code");
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      response.writeHead(302, { location: back.toString() });
      response.end();
    },
  ],
  [
    "POST",
    /^\/oauth\/token$/,
    async (request, response) => {
      const body = new URLSearchParams(await readBody(request));
      if (body.get("code") !== "mock-code") return json(response, 400, { error: "invalid_grant" });
      json(response, 200, { access_token: TOKEN, token_type: "bearer" });
    },
  ],
  [
    "GET",
    /^\/v3\/users\/me\/organizations\/$/,
    (_, response) =>
      json(response, 200, { organizations: [{ id: "org-mock", name: "Cuenta de prueba en Eventbrite" }] }),
  ],
  ["POST", /^\/v3\/organizations\/[^/]+\/webhooks\/$/, (_, response) => json(response, 200, { id: "hook-mock" })],
  ["DELETE", /^\/v3\/webhooks\/[^/]+\/$/, (_, response) => json(response, 200, { success: true })],
  ["POST", /^\/v3\/organizations\/[^/]+\/venues\/$/, (_, response) => json(response, 200, { id: `venue-${nextId++}` })],
  [
    "POST",
    /^\/v3\/organizations\/[^/]+\/events\/$/,
    (_, response, url, body) => {
      const id = String(nextId++);
      created.set(id, { name: body?.event?.name?.html ?? "", version: 0, live: false });
      json(response, 200, { id, url: `${origin}/e/${id}` });
    },
  ],
  ["POST", /^\/v3\/events\/(\d+)\/ticket_classes\/$/, (_, response) => json(response, 200, { id: `tc-${nextId++}` })],
  ["POST", /^\/v3\/events\/(\d+)\/ticket_classes\/[^/]+\/$/, (_, response) => json(response, 200, {})],
  [
    "GET",
    /^\/v3\/events\/(\d+)\/structured_content\/$/,
    (_, response, url, body, [, id]) =>
      json(response, 200, { page_version_number: String(created.get(id)?.version ?? 0) }),
  ],
  [
    "POST",
    /^\/v3\/events\/(\d+)\/structured_content\/(\d+)\/$/,
    (_, response, url, body, [, id, version]) => {
      const event = created.get(id);
      if (event) event.version = Number(version);
      json(response, 200, {});
    },
  ],
  [
    "POST",
    /^\/v3\/events\/(\d+)\/publish\/$/,
    (_, response, url, body, [, id]) => {
      const event = created.get(id);
      if (event) event.live = true;
      json(response, 200, { published: true });
    },
  ],
  ["POST", /^\/v3\/events\/(\d+)\/cancel\/$/, (_, response) => json(response, 200, { canceled: true })],
  [
    "POST",
    /^\/v3\/events\/(\d+)\/$/,
    (_, response, url, body, [, id]) => {
      const event = created.get(id);
      if (event && body?.event?.name?.html) event.name = body.event.name.html;
      json(response, 200, { id });
    },
  ],
  [
    "GET",
    /^\/v3\/events\/(\d+)\/attendees\/$/,
    (_, response, url, body, [, id]) =>
      json(response, 200, {
        attendees: [
          {
            id: `${id}-1`,
            event_id: id,
            created: "2026-10-01T12:00:00Z",
            changed: "2026-10-01T12:00:00Z",
            ticket_class_name: "General",
            checked_in: false,
            cancelled: false,
            refunded: false,
            profile: { name: "Persona de Eventbrite", email: "persona@eventbrite.test" },
            barcodes: [{ barcode: `${id}0001`, status: "unused" }],
          },
        ],
        pagination: { object_count: 1, page_number: 1, page_size: 50, page_count: 1, has_more_items: false },
      }),
  ],
  [
    "GET",
    /^\/e\/(\d+)$/,
    (_, response, url, body, [, id]) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>Eventbrite (mock)</title><h1>${created.get(id)?.name ?? "Evento"}</h1>`);
    },
  ],
  ["GET", /^\/$/, (_, response) => json(response, 200, { ok: true })],
];

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", origin);
  const route = routes.find(([method, path]) => method === request.method && path.test(url.pathname));
  console.log(`[mock-eventbrite] ${request.method} ${url.pathname}`);
  if (!route) return json(response, 404, { error: "NOT_FOUND", error_description: "No such endpoint" });
  if (url.pathname.startsWith("/v3/") && request.headers.authorization !== `Bearer ${TOKEN}`) {
    return json(response, 401, { error: "INVALID_AUTH", error_description: "Invalid OAuth token" });
  }
  const raw = request.method === "POST" && !url.pathname.startsWith("/oauth/") ? await readBody(request) : "";
  const body = raw ? JSON.parse(raw) : null;
  await route[2](request, response, url, body, url.pathname.match(route[1]));
}).listen(PORT, "127.0.0.1", () => console.log(`[mock-eventbrite] ${origin}`));
