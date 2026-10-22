import { createHash, timingSafeEqual } from "node:crypto";

import { Receiver } from "@upstash/qstash";
import { NextResponse, type NextRequest } from "next/server";

import { tick } from "lib/dispatch/tick";

export const maxDuration = 300;

/**
 * QStash calls this every 5 minutes (POST, signed). Each tick sends for at most ~50 s so a slow
 * one ends before the next begins.
 */
export async function POST(request: NextRequest) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return new NextResponse("QStash is not configured", { status: 503 });

  const body = await request.text();
  // devMode false: an env var must never switch verification to QStash's public dev keys.
  const receiver = new Receiver({ currentSigningKey, nextSigningKey, devMode: false });
  const valid = await receiver
    .verify({ signature: request.headers.get("upstash-signature") ?? "", body, url: request.url, clockTolerance: 5 })
    .catch(() => false);
  if (!valid) return new NextResponse("Bad signature", { status: 401 });

  return NextResponse.json(await tick(50_000));
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** The daily Vercel cron (GET with the CRON_SECRET bearer): a backstop when QStash is down. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("CRON_SECRET is not set", { status: 503 });
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return NextResponse.json(await tick(240_000, { daily: true }));
}
