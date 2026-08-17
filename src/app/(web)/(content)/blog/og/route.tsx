import { promises as fs } from "fs";
import path from "path";

import { ImageResponse } from "next/og";

// Deterministic star positions for the background (nod to the site's starfield)
const STARS = [
  [64, 88],
  [180, 40],
  [320, 150],
  [460, 70],
  [610, 120],
  [780, 50],
  [900, 170],
  [1050, 90],
  [1130, 220],
  [220, 520],
  [520, 560],
  [860, 540],
  [1080, 480],
  [90, 380],
  [1160, 350],
] as const;

// The .ttf files live next to this route and are traced into the serverless bundle
// via `outputFileTracingIncludes` in next.config.js. Cached across warm invocations.
const FONTS_DIR = path.join(process.cwd(), "src", "app", "(web)", "(content)", "blog", "og");
const fontCache = new Map<string, Promise<Buffer>>();

function loadFont(file: string) {
  const cached = fontCache.get(file);

  if (cached) return cached;

  const font = fs.readFile(path.join(FONTS_DIR, file));

  fontCache.set(file, font);

  return font;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "Blog de OWU").slice(0, 120);
  const author = searchParams.get("author")?.slice(0, 60);
  const tag = searchParams.get("tag")?.slice(0, 30);

  const [bold, medium] = await Promise.all([loadFont("poppins-bold.ttf"), loadFont("poppins-medium.ttf")]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        backgroundColor: "#101013",
        backgroundImage: "radial-gradient(ellipse 90% 70% at 50% -20%, #3e4713, #101013)",
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
            backgroundColor: "rgba(255, 255, 255, 0.55)",
          }}
        />
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            display: "flex",
            padding: "10px 26px",
            border: "4px solid #ffffff",
            borderRadius: 999,
            color: "#ffffff",
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          OWU
        </div>
        <div style={{ display: "flex", color: "#facc15", fontSize: 34, fontWeight: 500 }}>Blog</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", width: 72, height: 8, borderRadius: 8, backgroundColor: "#facc15" }} />
        <div
          style={{
            display: "flex",
            color: "#ffffff",
            fontSize: title.length > 60 ? 52 : 64,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: -1,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", color: "#a1a1aa", fontSize: 30, fontWeight: 500 }}>
          {author ? `Por ${author}` : "owu.uy/blog"}
        </div>
        {tag ? (
          <div
            style={{
              display: "flex",
              padding: "8px 24px",
              border: "2px solid rgba(250, 204, 21, 0.6)",
              borderRadius: 999,
              color: "#facc15",
              fontSize: 26,
              fontWeight: 500,
            }}
          >
            #{tag}
          </div>
        ) : null}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Poppins", data: bold, weight: 700 },
        { name: "Poppins", data: medium, weight: 500 },
      ],
    }
  );
}
