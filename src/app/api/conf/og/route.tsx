import { promises as fs } from "fs";
import path from "path";

import { ImageResponse } from "next/og";

import {
  cleanName,
  pick,
  SHARE_DESIGNS,
  SHARE_DISCLAIMER,
  SHARE_FORMATS,
  type ShareDesign,
  type ShareFormat,
} from "app/conf/share";

/*
 * OWU CONF share images: the visitor's badge hanging from the OWU lanyard, with the
 * event's details, in each platform's size. /api so it answers on conf.owu.uy too (the
 * proxy only lets the subdomain's own pages through). Files are read at runtime and
 * traced into the function via `outputFileTracingIncludes` in next.config.ts.
 */

const INK = "#0B0B0B";
const CREAM = "#FBF5E7";
const YELLOW = "#F5BB03";
const BLUE = "#0162C8";

const HERE = path.join(process.cwd(), "src", "app", "api", "conf", "og");
const BLOG_FONTS = path.join(process.cwd(), "src", "app", "(web)", "(content)", "blog", "og");
const STICKER = path.join(process.cwd(), "public", "images", "conf", "logo-sticker.svg");
const MARKER = path.join(process.cwd(), "public", "fonts", "permanent-marker.ttf");

const files = new Map<string, Promise<Buffer>>();
const read = (file: string) => {
  if (!files.has(file)) files.set(file, fs.readFile(file));
  return files.get(file)!;
};
const dataUri = async (file: string, type: string) => `data:${type};base64,${(await read(file)).toString("base64")}`;

const COPY: Record<ShareDesign, { eyebrow: string; headline: [string, string] }> = {
  voy: { eyebrow: "NOS VEMOS EL 7 DE NOVIEMBRE", headline: ["¡VOY A", "OWU CONF!"] },
  venis: { eyebrow: "CHARLAS · OPEN SPACE · COMUNIDAD", headline: ["¿VENÍS A", "OWU CONF?"] },
  evento: { eyebrow: "LA CONFERENCIA DE LA COMUNIDAD TECH", headline: ["SE VIENE", "OWU CONF"] },
};

const TAGLINE = ["LA TECNOLOGÍA SE", "CONSTRUYE ENTRE TODOS.", "LA COMUNIDAD TAMBIÉN."];

/* Splits a long name at the space closest to the middle */
function nameLines(label: string) {
  const spaces = [...label.matchAll(/ /g)].map((match) => match.index);
  if (label.length <= 11 || spaces.length === 0) return [label];
  const cut = spaces.reduce((best, i) =>
    Math.abs(i - label.length / 2) < Math.abs(best - label.length / 2) ? i : best
  );

  return [label.slice(0, cut), label.slice(cut + 1)];
}

type Art = { sticker: string; owu: string };

/* The printed badge, proportions as in the site's 3D badge (badgeArt.ts) */
function Badge({ width, name, art }: { width: number; name: string; art: Art }) {
  const w = width;
  const h = Math.round(w * 1.40625);
  // Written as typed, in marker, like a name tag filled in at the door
  const label = name || "Tu nombre";
  const lines = nameLines(label);
  // ponytail: Poppins ExtraBold caps average ~0.7em; satori can't measure before layout
  const nameSize = Math.min(w * 0.15, (w * 0.76) / (Math.max(...lines.map((line) => line.length)) * 0.62));
  const logoW = w * 0.63;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: w,
        height: h,
        background: INK,
        borderRadius: w * 0.026,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: w * 0.416,
          top: h * 0.024,
          width: w * 0.168,
          height: h * 0.02,
          borderRadius: 999,
          background: "#000",
        }}
      />
      <img
        alt=""
        height={logoW * (186 / 887)}
        src={art.sticker}
        style={{ position: "absolute", left: (w - logoW) / 2, top: h * 0.122 - (logoW * (186 / 887)) / 2 }}
        width={logoW}
      />
      <div
        style={{
          position: "absolute",
          left: w * 0.055,
          top: h * 0.28,
          width: w * 0.89,
          height: h * 0.361,
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: "rotate(-2.5deg)" }}>
          {lines.map((line) => (
            <div
              key={line}
              style={{ color: name ? INK : "#B3AEA3", fontFamily: "Marker", fontSize: nameSize, lineHeight: 1.08 }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
      <svg height={h} style={{ position: "absolute", left: 0, top: 0 }} viewBox={`0 0 ${w} ${h}`} width={w}>
        <polygon fill={YELLOW} points={`${w * 0.808},${h * 0.641} ${w},${h * 0.666} ${w * 0.808},${h * 0.741}`} />
      </svg>
      <div
        style={{ position: "absolute", left: 0, top: h * 0.747, width: w * 0.09, height: h * 0.158, background: BLUE }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: h * 0.735,
          width: w,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          color: "#FFFFFF",
          fontSize: w * 0.047,
          fontWeight: 800,
          lineHeight: 1.2,
        }}
      >
        {TAGLINE.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: h * 0.93,
          width: w,
          display: "flex",
          justifyContent: "center",
          color: "#FFFFFF",
          fontSize: w * 0.039,
          fontWeight: 500,
        }}
      >
        7 DE NOVIEMBRE - URUGUAY - CONF.OWU.UY
      </div>
    </div>
  );
}

/* The badge on its black OWU lanyard, hanging from the top edge of the image */
function Hanging({ width, strap, name, art }: { width: number; strap: number; name: string; art: Art }) {
  const s = width * 0.2;
  const tab = s * 0.6;
  const gap = s * 0.55;
  const badgeH = Math.round(width * 1.40625);
  const across = s * 0.62;
  const length = across * 2.49;
  // The printed strap repeats its logo, alternately one way up and the other
  const logos = Math.max(1, Math.floor(strap / (length * 1.8)));
  const center = width * 0.65;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: width * 1.3,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          width: s,
          height: strap,
          overflow: "hidden",
          background: "linear-gradient(90deg, #3a3a3a 0%, #101010 6%, #232323 50%, #101010 94%, #3a3a3a 100%)",
        }}
      >
        {Array.from({ length: logos }, (_, i) => (
          <img
            alt=""
            key={i}
            height={length}
            src={art.owu}
            style={{
              position: "absolute",
              left: (s - across) / 2,
              top: ((i + 0.5) * strap) / logos - length / 2,
              transform: `rotate(${i % 2 ? 180 : 0}deg)`,
            }}
            width={across}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: s,
          height: tab,
          background: "#151515",
        }}
      >
        <div style={{ width: s * 0.2, height: s * 0.2, borderRadius: 999, background: "#cfcfcf" }} />
      </div>
      <div style={{ height: gap }} />
      <Badge art={art} name={name} width={width} />
      {/* Split ring and clasp into the slot, drawn over the badge */}
      <div
        style={{
          position: "absolute",
          top: strap + tab - s * 0.08,
          left: center - s * 0.19,
          width: s * 0.38,
          height: s * 0.38,
          borderRadius: 999,
          border: `${s * 0.07}px solid #d8d8d8`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: strap + tab + s * 0.24,
          left: center - s * 0.05,
          width: s * 0.1,
          height: gap - s * 0.24 + badgeH * 0.04,
          borderRadius: 999,
          background: "#d8d8d8",
        }}
      />
    </div>
  );
}

function Headline({ lines, size, center }: { lines: [string, string]; size: number; center?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: center ? "center" : "flex-start",
        fontSize: size,
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: -size * 0.02,
      }}
    >
      <div style={{ color: CREAM }}>{lines[0]}</div>
      <div style={{ color: YELLOW }}>{lines[1]}</div>
    </div>
  );
}

function Pill({ size }: { size: number }) {
  return (
    <div
      style={{
        display: "flex",
        padding: `${size * 0.6}px ${size * 1.2}px`,
        borderRadius: 999,
        background: YELLOW,
        color: INK,
        fontSize: size,
        fontWeight: 800,
      }}
    >
      ENTRADAS GRATIS · CONF.OWU.UY
    </div>
  );
}

function Disclaimer({ size, center }: { size: number; center?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: center ? "center" : "flex-start",
        gap: size * 0.6,
        color: "rgba(251,245,231,0.75)",
        fontSize: size,
        fontWeight: 500,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size * 1.3,
          height: size * 1.3,
          borderRadius: 999,
          border: `2px solid ${YELLOW}`,
          color: YELLOW,
          fontSize: size * 0.85,
          fontWeight: 800,
        }}
      >
        !
      </div>
      {SHARE_DISCLAIMER}
    </div>
  );
}

function LinkCard({ design, name, art }: { design: ShareDesign; name: string; art: Art }) {
  const copy = COPY[design];

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#000",
        backgroundImage: "radial-gradient(circle at 77% 55%, rgba(1,98,200,0.35) 0%, rgba(0,0,0,0) 45%)",
      }}
    >
      <div style={{ position: "absolute", left: 0, bottom: 0, width: 26, height: 210, background: BLUE }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 700,
          height: "100%",
          padding: "54px 0 46px 72px",
        }}
      >
        <img alt="" height={230 * (186 / 887)} src={art.sticker} width={230} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "rgba(251,245,231,0.7)", fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>
            {copy.eyebrow}
          </div>
          <div style={{ display: "flex", marginTop: 16 }}>
            <Headline lines={copy.headline} size={86} />
          </div>
          <div style={{ marginTop: 20, color: CREAM, fontSize: 24, fontWeight: 500 }}>
            Sábado 7 de noviembre · Sinergia Faro, Montevideo
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 18 }}>
          <Pill size={22} />
          <Disclaimer size={16} />
        </div>
      </div>
      <div style={{ position: "absolute", right: 70, top: 0, display: "flex" }}>
        <Hanging art={art} name={name} strap={120} width={290} />
      </div>
    </div>
  );
}

/* Post and story: the badge hangs from the top edge, the message below it. The story keeps
   clear of Instagram's top and bottom bars (~200px each). */
function Portrait({ design, name, art, story }: { design: ShareDesign; name: string; art: Art; story: boolean }) {
  const copy = COPY[design];
  const k = story ? 1.15 : 1;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        height: "100%",
        padding: story ? "0 64px 230px" : "0 64px 54px",
        background: "#000",
        backgroundImage: `radial-gradient(circle at 50% ${story ? 36 : 40}%, rgba(1,98,200,0.4) 0%, rgba(0,0,0,0) 46%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: story ? 980 : 470,
          width: 30 * k,
          height: 280 * k,
          background: BLUE,
        }}
      />
      <svg
        height={240 * k}
        style={{ position: "absolute", right: 0, top: story ? 380 : 150 }}
        viewBox="0 0 100 200"
        width={120 * k}
      >
        <polygon fill={YELLOW} points="100,0 0,70 100,200" />
      </svg>
      <div style={{ display: "flex", transform: "rotate(-2deg)", transformOrigin: "50% 0%" }}>
        <Hanging art={art} name={name} strap={story ? 250 : 100} width={story ? 520 : 410} />
      </div>
      <div
        style={{
          marginTop: (story ? 64 : 44) * k,
          color: "rgba(251,245,231,0.7)",
          fontSize: 22 * k,
          fontWeight: 700,
          letterSpacing: 4,
        }}
      >
        {copy.eyebrow}
      </div>
      <div style={{ display: "flex", marginTop: 18 * k }}>
        <Headline center lines={copy.headline} size={(story ? 104 : 92) * k} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 * k, marginTop: "auto" }}>
        <div style={{ color: CREAM, fontSize: 25 * k, fontWeight: 500 }}>
          Sábado 7 de noviembre · Sinergia Faro, Montevideo
        </div>
        <Pill size={25 * k} />
        <Disclaimer center size={18 * k} />
      </div>
    </div>
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const design = pick<ShareDesign>(searchParams.get("d"), SHARE_DESIGNS, "voy");
  const format = pick<ShareFormat>(searchParams.get("f"), SHARE_FORMATS, "link");
  const name = cleanName(searchParams.get("nombre"));

  const [extraBold, bold, medium, marker, sticker, owu] = await Promise.all([
    read(path.join(HERE, "poppins-extrabold.ttf")),
    read(path.join(BLOG_FONTS, "poppins-bold.ttf")),
    read(path.join(BLOG_FONTS, "poppins-medium.ttf")),
    read(MARKER),
    dataUri(STICKER, "image/svg+xml"),
    dataUri(path.join(HERE, "owu-strap.png"), "image/png"),
  ]);
  const art = { sticker, owu };
  const { width, height } = SHARE_FORMATS[format];

  return new ImageResponse(
    format === "link" ? (
      <LinkCard art={art} design={design} name={name} />
    ) : (
      <Portrait art={art} design={design} name={name} story={format === "historia"} />
    ),
    {
      width,
      height,
      // Same URL, same image: the CDN keeps each one (its cache resets on every deploy), browsers a day
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400" },
      fonts: [
        { name: "Poppins", data: extraBold, weight: 800, style: "normal" },
        { name: "Poppins", data: bold, weight: 700, style: "normal" },
        { name: "Poppins", data: medium, weight: 500, style: "normal" },
        { name: "Marker", data: marker, weight: 400, style: "normal" },
      ],
    }
  );
}
