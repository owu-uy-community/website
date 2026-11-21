import { randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { MAX_BYTES, PHONE_COOKIE, PHOTOS_PER_PHONE, isJpeg, isPhoneId, photosMaxTotal } from "lib/conf-photos";
import { db } from "lib/db";
import { confPhotos } from "lib/db/schema";

/*
 * conf.owu.uy/fotos uploads, one photo per POST: the page resizes each photo to a JPEG under
 * 4 MB first, so it fits a function body. Guardrails: JPEG bytes only (a video never decodes
 * on the phone, and a renamed one fails the byte check here), 80 per phone, a cap for the
 * whole event, public URLs nobody can guess (the phone's id never appears in them).
 *
 *   GET  → { count, limit }   how many this phone uploaded
 *   POST → image/jpeg body    { count, limit } or { error }
 */

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * The phone's random id, minted on its first visit. Not a person: clearing cookies starts over,
 * which is what the event-wide cap is for.
 */
async function phoneId(): Promise<string> {
  const jar = await cookies();
  const current = jar.get(PHONE_COOKIE)?.value;
  if (isPhoneId(current)) return current;

  const id = randomBytes(16).toString("base64url");
  jar.set(PHONE_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return id;
}

const uploadedBy = async (phone: string) =>
  (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(confPhotos)
      .where(eq(confPhotos.phone, phone))
  )[0].n;

export async function GET() {
  return json({ count: await uploadedBy(await phoneId()), limit: PHOTOS_PER_PHONE });
}

export async function POST(request: Request) {
  if (request.headers.get("content-type") !== "image/jpeg") {
    return json({ error: "Solo fotos: los videos y otros archivos no se suben" }, 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BYTES) {
    return json({ error: "La foto es demasiado grande" }, 413);
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return json({ error: "La foto es demasiado grande" }, 413);
  if (!isJpeg(new Uint8Array(body))) return json({ error: "Solo fotos: los videos y otros archivos no se suben" }, 415);

  const phone = await phoneId();

  // Reserve the row first, so two uploads at once can't both take the last slot.
  // ponytail: one lock for every reservation (a few ms each); lock per phone if uploads ever queue on it.
  const reserved = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('conf_photos'))`);
    const [{ mine, total }] = await tx
      .select({
        mine: sql<number>`(count(*) filter (where ${confPhotos.phone} = ${phone}))::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(confPhotos);
    if (mine >= PHOTOS_PER_PHONE) return { refused: "phone" as const, count: mine };
    if (total >= photosMaxTotal()) return { refused: "event" as const, count: mine };
    const [row] = await tx
      .insert(confPhotos)
      .values({ phone, bytes: body.byteLength })
      .returning({ id: confPhotos.id });

    return { id: row.id, count: mine + 1 };
  });

  if ("refused" in reserved) {
    return json(
      {
        error:
          reserved.refused === "phone"
            ? `Ya subiste ${PHOTOS_PER_PHONE} fotos desde este celular: ¡gracias!`
            : "Ya llegamos al máximo de fotos del evento: ¡gracias!",
        count: reserved.count,
        limit: PHOTOS_PER_PHONE,
      },
      429
    );
  }

  // Unreachable, Blob retries 10 times with backoff (~17 min) while the phone waits and the slot
  // stays taken. A plain abort() ends that (AbortSignal.timeout's TimeoutError would be retried).
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30_000);
  try {
    const blob = await put(`conf-fotos/${reserved.id}.jpg`, body, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: true,
      abortSignal: abort.signal,
    });
    await db.update(confPhotos).set({ url: blob.url }).where(eq(confPhotos.id, reserved.id));
  } catch (error) {
    console.error("[conf-fotos] upload", error);
    await db.delete(confPhotos).where(eq(confPhotos.id, reserved.id));

    return json({ error: "No pudimos guardar la foto: probá de nuevo" }, 502);
  } finally {
    clearTimeout(timer);
  }

  return json({ count: reserved.count, limit: PHOTOS_PER_PHONE });
}
