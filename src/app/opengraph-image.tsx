import { promises as fs } from "fs";
import path from "path";

import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";

import { COVER_SIZE, FONTS_DIR, LOGO, STARS } from "lib/og/cover";

export const size = COVER_SIZE;
export const contentType = "image/png";
export const alt = "OWU, la comunidad tech de Uruguay";

/** The site's share image, like the home hero: the sticker logo over "Creamos en comunidad." */
export default async function Image() {
  return new Response(await render(), { headers: { "Content-Type": contentType } });
}

// Rendered once at build, like the talk covers; uncached it would render on every crawler hit
async function render(): Promise<ArrayBuffer> {
  "use cache";
  cacheLife("max");

  const [bold, medium, logo] = await Promise.all([
    fs.readFile(path.join(FONTS_DIR, "poppins-bold.ttf")),
    fs.readFile(path.join(FONTS_DIR, "poppins-medium.ttf")),
    fs.readFile(LOGO),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0c0c0f",
        backgroundImage: "radial-gradient(ellipse 75% 65% at 50% -15%, #3e4713, rgba(12,12,15,0) 70%)",
        fontFamily: "Poppins",
        position: "relative",
      }}
    >
      {STARS.map(([x, y]) => (
        <div
          key={`${x}-${y}`}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: 3,
            height: 3,
            borderRadius: 3,
            backgroundColor: "rgba(255,255,255,0.45)",
          }}
        />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" height={121} src={`data:image/png;base64,${logo.toString("base64")}`} width={300} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 36,
          fontSize: 104,
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: -3,
        }}
      >
        <div style={{ color: "#facc15" }}>Creamos</div>
        <div style={{ color: "#fafafa" }}>en comunidad.</div>
      </div>
      <div style={{ marginTop: 28, color: "#d4d4d8", fontSize: 32, fontWeight: 500 }}>
        La comunidad tech de Uruguay, desde 2014
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Poppins", data: bold, weight: 700 },
        { name: "Poppins", data: medium, weight: 500 },
      ],
    }
  ).arrayBuffer();
}
