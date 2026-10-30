import { connection, NextResponse, type NextRequest } from "next/server";

import { mailboxEnabled, mailboxMessages } from "lib/email/mailbox";

/** What the app "sent" without a Resend key: local dev and the e2e build only. `?to=` filters. */
export async function GET(request: NextRequest) {
  // The mailbox lives in this server's memory: never prerendered
  await connection();
  if (!mailboxEnabled()) return new NextResponse(null, { status: 404 });

  return NextResponse.json(mailboxMessages(request.nextUrl.searchParams.get("to")));
}
