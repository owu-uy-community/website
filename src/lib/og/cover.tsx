import { promises as fs } from "fs";
import path from "path";

import { ImageResponse } from "next/og";

export const FONTS_DIR = path.join(process.cwd(), "src", "app", "(web)", "(content)", "blog", "og");
export const LOGO = path.join(process.cwd(), "src", "app", "(web)", "(content)", "charlas", "og", "owu-logo.png");

export const COVER_SIZE = { width: 1200, height: 630 };
/** Share cards to post: a square for feeds, a 9:16 story */
export const CARD_SIZES = { cuadrada: { width: 1080, height: 1080 }, historia: { width: 1080, height: 1920 } } as const;

// Deterministic star positions, like the blog covers (a nod to the site's starfield)
export const STARS = [
  [64, 96],
  [210, 44],
  [380, 150],
  [540, 70],
  [690, 128],
  [860, 52],
  [1000, 160],
  [1130, 84],
  [150, 560],
  [470, 590],
  [820, 570],
  [1100, 500],
  [40, 360],
  [1170, 330],
] as const;

/**
 * OWU's cover: logo and a pill on top, the title under the yellow bar, a two-line footer and up to
 * two chips. Talks and events share it, so every share looks like OWU. 1200×630 unless `size` says
 * otherwise (the square and story cards scale the type up).
 */
export async function renderCover({
  tag,
  title,
  footerLabel,
  footer,
  chips = [],
  dimmed = false,
  subtitle,
  size = COVER_SIZE,
}: {
  tag: string;
  title: string;
  footerLabel: string;
  footer: string;
  chips?: string[];
  /** A cancelled event: the title struck through */
  dimmed?: boolean;
  /** A line under the title (a date) */
  subtitle?: string;
  size?: { width: number; height: number };
}) {
  const [bold, medium, logo] = await Promise.all([
    fs.readFile(path.join(FONTS_DIR, "poppins-bold.ttf")),
    fs.readFile(path.join(FONTS_DIR, "poppins-medium.ttf")),
    fs.readFile(LOGO),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  // Taller cards read from further away: bigger type
  const k = size.height > size.width ? 1.4 : size.height === size.width ? 1.15 : 1;
  const titleSize = Math.round((title.length > 70 ? 50 : title.length > 42 ? 58 : 68) * k);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: `${Math.round(64 * k)}px 72px`,
        backgroundColor: "#0c0c0f",
        backgroundImage:
          "radial-gradient(ellipse 80% 70% at 85% -10%, rgba(250,204,21,0.16), rgba(12,12,15,0) 60%), radial-gradient(ellipse 70% 80% at 0% 110%, #2b3110, rgba(12,12,15,0) 65%)",
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" height={52} src={logoSrc} width={129} />
        <div
          style={{
            display: "flex",
            padding: "10px 24px",
            border: "2px solid rgba(250,204,21,0.55)",
            borderRadius: 999,
            color: "#facc15",
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: 0.5,
          }}
        >
          {tag}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", width: 72, height: 8, borderRadius: 8, backgroundColor: "#facc15" }} />
        <div
          style={{
            display: "flex",
            color: dimmed ? "#71717a" : "#fafafa",
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: -1.5,
            maxWidth: size.width - 160,
            textDecoration: dimmed ? "line-through" : "none",
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ display: "flex", color: "#facc15", fontSize: Math.round(30 * k), fontWeight: 500 }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 820 }}>
          <div style={{ display: "flex", color: "#71717a", fontSize: Math.round(22 * k), fontWeight: 500 }}>
            {footerLabel}
          </div>
          <div
            style={{
              display: "flex",
              color: "#e4e4e7",
              fontSize: Math.round(32 * k),
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            {footer}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {chips.slice(0, 2).map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                padding: "6px 18px",
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.08)",
                color: "#d4d4d8",
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Poppins", data: bold, weight: 700 },
        { name: "Poppins", data: medium, weight: 500 },
      ],
    }
  );
}

/** "#data-e-ia" style chips from topic labels */
export const topicChip = (label: string) => `#${label.toLowerCase().replace(/\s+/g, "-")}`;
