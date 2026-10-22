import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { encode } from "uqr";

import { db } from "lib/db";
import { attendees } from "lib/db/schema";
import { readLink } from "lib/links";

/**
 * A ticket's QR as a PNG (mail clients don't show SVG), from the signed link in its emails. It
 * holds the ticket code the door scanner reads; GET only reads.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const id = await readLink("ticket", token);
  if (!id) return new Response("Not found", { status: 404 });
  const [row] = await db.select({ code: attendees.barcode }).from(attendees).where(eq(attendees.id, id));
  if (!row?.code) return new Response("Not found", { status: 404 });

  const qr = encode(row.code, { border: 2, ecc: "M" });
  const cell = Math.floor(360 / qr.size);
  const side = cell * qr.size;

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#fff" }}>
      <svg height={side} shapeRendering="crispEdges" viewBox={`0 0 ${qr.size} ${qr.size}`} width={side}>
        <path
          d={qr.data.flatMap((line, y) => line.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ""))).join("")}
          fill="#000"
        />
      </svg>
    </div>,
    { width: side, height: side, headers: { "Cache-Control": "private, max-age=86400" } }
  );
}
