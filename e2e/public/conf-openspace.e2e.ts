import { db } from "../../src/lib/db";
import { outboundMessages } from "../../src/lib/db/schema";
import { makeBoard, makeSlot, makeTrack } from "../../src/test/factories";
import { expect, test } from "../fixtures";

// conf.owu.uy/openspace reads the conf's fixed slugs (CONF_EVENT): this spec owns them, in order
test.describe.configure({ mode: "serial" });

const montevideo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const partsIn = (minutesFromNow: number) =>
  Object.fromEntries(
    montevideo.formatToParts(new Date(Date.now() + minutesFromNow * 60_000)).map((part) => [part.type, part.value])
  );
const clockIn = (minutesFromNow: number) => `${partsIn(minutesFromNow).hour}:${partsIn(minutesFromNow).minute}`;

test("before its board exists, the page explains the afternoon", async ({ pageAs }) => {
  const visitor = await pageAs("anonymous");
  await visitor.goto("/conf/openspace");

  await expect(visitor.getByRole("heading", { name: /Open Space en vivo/i })).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Cómo va a ser la tarde" })).toBeVisible();
});

test("on the day: what's on now, the team's avisos, and cards and room status arriving live", async ({
  page,
  pageAs,
}) => {
  const board = await makeBoard({
    community: { slug: "owu", name: "OWU" },
    event: { slug: "owu-conf-2026", name: "OWU CONF 2026" },
  });
  const today = partsIn(0);
  const end = clockIn(20);
  const block = await makeSlot(board.event.id, {
    date: new Date(`${today.year}-${today.month}-${today.day}T00:00:00.000Z`),
    startTime: clockIn(-5),
    // A run a few minutes before midnight still gets a block that is on
    endTime: end > clockIn(-5) ? end : "23:59",
  });
  await makeTrack(
    { eventId: board.event.id, scheduleId: block.id, roomId: board.rooms.plain.id },
    { title: "Monorepos: lo bueno y lo malo" }
  );
  await db.insert(outboundMessages).values([
    {
      eventId: board.event.id,
      channel: "telegram",
      body: "Arrancó el mercado de ideas",
      status: "sent",
      sentAt: new Date(),
    },
    { eventId: board.event.id, channel: "staff_dm", body: "Solo para el staff", status: "sent", sentAt: new Date() },
  ]);

  const visitor = await pageAs("anonymous");
  const socket = visitor.waitForEvent("websocket");
  await visitor.goto("/conf/openspace");
  // Changes only reach a page that is listening: wait until the hub confirms the subscription
  await (
    await socket
  ).waitForEvent("framereceived", {
    predicate: (frame) => String(frame.payload).includes(`"ch":"event:${board.event.id}:sync"`),
  });

  const now = visitor.getByRole("region", { name: "Ahora en el open space" });
  await expect(now.getByText("Monorepos: lo bueno y lo malo")).toBeVisible();
  await expect(visitor.getByText("Arrancó el mercado de ideas")).toBeVisible();
  await expect(visitor.getByText("Solo para el staff")).toHaveCount(0);

  const act = (path: string, json: Record<string, unknown>) =>
    page.request.post(`/api/orpc/${path}`, { data: { json } });

  await act("tracks/create", {
    openSpaceId: board.event.id,
    scheduleId: block.id,
    roomId: board.rooms.tv.id,
    title: "Agentes de IA en producción",
  });
  await expect(now.getByText("Agentes de IA en producción")).toBeVisible();

  await act("rooms/setStatus", { roomId: board.rooms.plain.id, status: "full" });
  await expect(now.getByText("Llena")).toBeVisible();

  await act("rooms/setStatus", { roomId: board.rooms.plain.id, status: "evacuate" });
  await expect(visitor.getByRole("alert").filter({ hasText: `Evacuar ${board.rooms.plain.name}` })).toBeVisible();
});
