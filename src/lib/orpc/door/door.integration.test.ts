import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp } from "test/factories";

async function setup() {
  const community = await makeCommunity();
  const event = await makeEvent(community.id, {
    status: "published",
    registration: "owu",
    startDate: new Date(Date.now() + 3_600_000),
    endDate: new Date(Date.now() + 3 * 3_600_000),
  });
  const [admin, editor] = await Promise.all([makeMember(community.id, "admin"), makeMember(community.id, "editor")]);
  const ana = await makeRsvp(event.id, { name: "Ana Puerta" });

  return { community, event, admin, editor, ana };
}

const tokenOf = (url: string) => url.split("/puerta/")[1] ?? "";

describe("the volunteers' door", () => {
  test("a link lets someone without an account find people (no emails), scan them and let walk-ins in", async () => {
    const { community, event, admin, editor, ana } = await setup();
    const ref = { communityId: community.id, eventId: event.id };

    await expect(call(router.events.doorLink, ref, by(editor))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const token = tokenOf((await call(router.events.doorLink, ref, by(admin))).url);

    const found = await call(router.door.search, { token, q: "puerta" }, by(null));
    expect(found.rows).toMatchObject([{ name: "Ana Puerta", email: "" }]);
    await expect(
      call(router.door.scan, { token, code: ana.barcode ?? "", nonce: createId() }, by(null))
    ).resolves.toMatchObject({ result: "ok" });
    await call(router.door.walkIn, { token, name: "Beto Sin Anotarse" }, by(null));
    await expect(call(router.door.counts, { token }, by(null))).resolves.toMatchObject({
      totals: { all: 2, in: 2, out: 0 },
    });
  });

  test("revoking stops every link handed out; a forged one never worked", async () => {
    const { community, event, admin } = await setup();
    const ref = { communityId: community.id, eventId: event.id };
    const token = tokenOf((await call(router.events.doorLink, ref, by(admin))).url);

    await call(router.events.revokeDoor, ref, by(admin));

    await expect(call(router.door.info, { token }, by(null))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call(router.door.info, { token: `${token.slice(0, -3)}abc` }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const fresh = tokenOf((await call(router.events.doorLink, ref, by(admin))).url);
    await expect(call(router.door.info, { token: fresh }, by(null))).resolves.toMatchObject({ eventId: event.id });
  });
});

describe("the event dashboard", () => {
  test("editors see counts; admins write to the people, each gets it once", async () => {
    const { community, event, admin, editor, ana } = await setup();
    const waiting = await makeRsvp(event.id, { status: "waitlisted" });
    const ref = { communityId: community.id, eventId: event.id };
    const write = () =>
      call(
        router.events.message,
        { ...ref, to: ["attending"], subject: "Cambió el salón", body: "Nos vemos en el salón 2, mismo horario." },
        by(admin)
      );

    await expect(call(router.events.stats, ref, by(editor))).resolves.toMatchObject({
      attending: 1,
      waiting: 1,
      taken: 1,
    });
    await expect(
      call(
        router.events.message,
        { ...ref, to: ["attending"], subject: "Hola", body: "Mensaje de prueba largo." },
        by(editor)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await write();
    await write();

    const sent = (to: string) =>
      db
        .select()
        .from(emailDeliveries)
        .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, "event_message")));
    await expect(sent(ana.email)).resolves.toHaveLength(1);
    await expect(sent(waiting.email)).resolves.toHaveLength(0);
  });
});
