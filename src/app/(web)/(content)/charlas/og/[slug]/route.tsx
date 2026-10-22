import { promises as fs } from "fs";
import path from "path";

import { ImageResponse } from "next/og";

import { talkEventLabel } from "components/community/TalkCard";
import { getTalks } from "lib/community/content";
import { topicLabel } from "lib/community/topics";

/*
 * One OWU-branded cover per talk (1200×630, the social-card size), used by the archive
 * cards and fit to share. Every image is rendered at build time; a new talk ships with
 * a deploy, so unknown slugs 404 instead of rendering on demand.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const talks = await getTalks();

  return talks.map(({ slug }) => ({ slug }));
}

const OG_DIR = path.join(process.cwd(), "src", "app", "(web)", "(content)", "charlas", "og");
const FONTS_DIR = path.join(process.cwd(), "src", "app", "(web)", "(content)", "blog", "og");

// Deterministic star positions, like the blog covers (a nod to the site's starfield)
const STARS = [
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

/** "Ana", "Ana y Beto", "Ana, Beto y Caro" */
const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const talk = (await getTalks()).find((item) => item.slug === slug);

  if (!talk) return new Response("Not found", { status: 404 });

  const [bold, medium, logo] = await Promise.all([
    fs.readFile(path.join(FONTS_DIR, "poppins-bold.ttf")),
    fs.readFile(path.join(FONTS_DIR, "poppins-medium.ttf")),
    fs.readFile(path.join(OG_DIR, "owu-logo.png")),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  const eventLabel = talkEventLabel(talk.event);
  const year = talk.date.slice(0, 4);
  const tag = eventLabel.includes(year) ? eventLabel : `${eventLabel} · ${year}`;
  const titleSize = talk.title.length > 70 ? 50 : talk.title.length > 42 ? 58 : 68;
  const topics = talk.topics.slice(0, 2).map((topic) => `#${topicLabel(topic).toLowerCase().replace(/\s+/g, "-")}`);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
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
            color: "#fafafa",
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: -1.5,
            maxWidth: 1040,
          }}
        >
          {talk.title}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 820 }}>
          <div style={{ display: "flex", color: "#71717a", fontSize: 22, fontWeight: 500 }}>Charla de</div>
          <div style={{ display: "flex", color: "#e4e4e7", fontSize: 32, fontWeight: 500, lineHeight: 1.2 }}>
            {joinNames(talk.speakers)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {topics.map((topic) => (
            <div
              key={topic}
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
              {topic}
            </div>
          ))}
        </div>
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
