import { NextResponse, type NextRequest } from "next/server";

import { db } from "lib/db";
import { emailSuppressions } from "lib/db/schema";
import { readUnsubscribe } from "lib/links";

/**
 * Stop reminders and feedback emails, or followed communities' new events (the link says which),
 * for an address: a mail client's one-click (RFC 8058: POST to
 * the header's URL) or the confirm page's form (?form=1, then back to the page). Never on GET:
 * mail scanners open links.
 */
export async function POST(request: NextRequest) {
  const fromPage = request.nextUrl.searchParams.has("form");
  const body = await request.formData().catch(() => null);
  const token = request.nextUrl.searchParams.get("t") ?? String(body?.get("t") ?? "");
  const link = await readUnsubscribe(token);
  if (!link) return new NextResponse("Link inválido", { status: 400 });

  await db.insert(emailSuppressions).values(link).onConflictDoNothing();

  return fromPage
    ? NextResponse.redirect(new URL(`/email/baja?listo=${link.scope}`, request.url), 303)
    : new NextResponse(null, { status: 200 });
}
