import { SPONSORS_2026 } from "./Sponsors";

/*
 * The OWU CONF 2026 badge, painted on 2D canvases that the 3D scene wraps as
 * textures (and the flat fallback shows as is). Proportions are measured off
 * the printed badge, as fractions of its width (W) and height (H).
 */

export const W = 1024;
export const H = 1440;

const INK = "#0B0B0B";
const CREAM = "#FBF5E7";
const YELLOW = "#F5BB03";
const BLUE = "#0162C8";
const FONT = "Poppins, sans-serif";
/* The name is written by hand on the printed badge: a marker on the white panel */
const HAND = '"Permanent Marker", cursive';
const HAND_URL = "/fonts/permanent-marker.ttf";

const STICKER = "/images/conf/logo-sticker.svg";
/* The community logo printed along the OWU lanyard */
const OWU_STICKER = "/images/logos/owu.webp";

export type BadgeArt = {
  sticker: HTMLImageElement;
  owu: HTMLImageElement;
  /** Sponsor logos as white silhouettes, like the sponsors wall */
  sponsors: HTMLCanvasElement[];
};

async function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();

  return img;
}

/* Rasterized here because some browsers won't paint an SVG without intrinsic size straight onto a canvas */
function silhouette(img: HTMLImageElement) {
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3;
  const canvas = document.createElement("canvas");
  canvas.height = 160;
  canvas.width = Math.round(160 * ratio);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas;
}

let loading: Promise<BadgeArt> | null = null;

/** Loaded once and shared by the 3D badge, the flat fallback and the download; a failure lets the next call retry */
export function loadBadgeArt() {
  loading ??= load().catch((error: unknown) => {
    loading = null;
    throw error;
  });

  return loading;
}

async function load(): Promise<BadgeArt> {
  // Only the badge uses the marker, so it's loaded here rather than with the site's fonts
  const hand = new FontFace("Permanent Marker", `url(${HAND_URL})`);
  document.fonts.add(await hand.load());
  await Promise.all(["800", "700", "500"].map((weight) => document.fonts.load(`${weight} 64px Poppins`)));
  const [sticker, owu, ...sponsors] = await Promise.all([
    loadImage(STICKER),
    loadImage(OWU_STICKER),
    // A logo that fails to load leaves a gap, not a blank badge
    ...SPONSORS_2026.map(({ logo }) =>
      loadImage(logo)
        .then(silhouette)
        .catch(() => null)
    ),
  ]);

  return { sticker, owu, sponsors: sponsors.filter((logo) => logo !== null) };
}

export function newCanvas(width = W, height = H) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  return canvas;
}

/* Black card with rounded corners and the punched slot the clip goes through (transparent, so the 3D clip shows) */
function blank(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 26);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.roundRect(W / 2 - 86, 34, 172, 28, 14);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  return ctx;
}

/** Largest font size (up to `max`) at which `text` fits in `width` */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, width: number, max: number, family = FONT) {
  ctx.font = `${weight} 100px ${family}`;

  return Math.min(max, (100 * width) / ctx.measureText(text).width);
}

function centered(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, weight: number, color: string) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, y);
}

/* Splits at the space closest to the middle */
function halves(text: string) {
  const spaces = [...text.matchAll(/ /g)].map((match) => match.index);
  if (spaces.length === 0) return null;
  const cut = spaces.reduce((best, i) => (Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2) ? i : best));

  return [text.slice(0, cut), text.slice(cut + 1)];
}

const TAGLINE = ["LA TECNOLOGÍA SE", "CONSTRUYE ENTRE TODOS.", "LA COMUNIDAD TAMBIÉN."];

export function drawFront(canvas: HTMLCanvasElement, art: BadgeArt, name: string) {
  const ctx = blank(canvas);

  const logoW = W * 0.63;
  const logoH = (logoW * art.sticker.naturalHeight) / art.sticker.naturalWidth;
  ctx.drawImage(art.sticker, (W - logoW) / 2, H * 0.122 - logoH / 2, logoW, logoH);

  // The name panel
  const box = { x: W * 0.055, y: H * 0.28, w: W * 0.89, h: H * 0.361 };
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(box.x, box.y, box.w, box.h);

  // Written as typed, slightly askew, like a name tag filled in at the door
  const label = name.trim() || "Tu nombre";
  const lineWidth = box.w - 120;
  const single = fit(ctx, label, 400, lineWidth, 170, HAND);
  const split = single < 110 ? halves(label) : null;
  const lines = split ?? [label];
  const size = split ? Math.min(...split.map((line) => fit(ctx, line, 400, lineWidth, 140, HAND))) : single;
  ctx.save();
  ctx.translate(W / 2, box.y + box.h / 2);
  ctx.rotate(-0.045);
  ctx.font = `400 ${size}px ${HAND}`;
  ctx.fillStyle = name.trim() ? INK : "#B3AEA3";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * size * 1.08));
  ctx.restore();

  // Brand shapes: the yellow flag under the panel's right end, the blue block on the left edge
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.moveTo(W * 0.808, box.y + box.h);
  ctx.lineTo(W, box.y + box.h + H * 0.025);
  ctx.lineTo(W * 0.808, H * 0.741);
  ctx.fill();
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, H * 0.747, W * 0.09, H * 0.158);

  const tagline = Math.min(...TAGLINE.map((line) => fit(ctx, line, 800, W * 0.64, 60)));
  TAGLINE.forEach((line, i) => centered(ctx, line, H * (0.751 + i * 0.0375), tagline, 800, "#FFFFFF"));

  const footer = "7 DE NOVIEMBRE - URUGUAY - CONF.OWU.UY";
  centered(ctx, footer, H * 0.95, fit(ctx, footer, 500, W * 0.9, 44), 500, "#FFFFFF");

  return canvas;
}

export function drawBack(canvas: HTMLCanvasElement, art: BadgeArt) {
  const ctx = blank(canvas);

  centered(ctx, "LO HACEN POSIBLE", H * 0.085, 30, 700, "rgba(251,245,231,0.6)");
  centered(ctx, "SPONSORS", H * 0.13, 84, 800, YELLOW);

  // Logos sized by area rather than width, so long wordmarks and square lockups weigh the same
  const cols = 3;
  const rows = Math.ceil(art.sponsors.length / cols);
  const grid = { x: W * 0.06, y: H * 0.19, w: W * 0.88, h: H * 0.43 };
  const cellW = grid.w / cols;
  const cellH = grid.h / rows;
  art.sponsors.forEach((logo, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, art.sponsors.length - row * cols);
    const col = i % cols;
    const ratio = logo.width / logo.height;
    let w = Math.min(cellW * 0.8, Math.sqrt(9000 * ratio));
    let h = w / ratio;
    if (h > cellH * 0.62) {
      h = cellH * 0.62;
      w = h * ratio;
    }
    // A short last row stays centered
    const x = grid.x + (cols - inRow) * (cellW / 2) + col * cellW + (cellW - w) / 2;
    ctx.drawImage(logo, x, grid.y + row * cellH + (cellH - h) / 2, w, h);
  });

  // The front's shapes, mirrored as if seen through the card
  ctx.fillStyle = BLUE;
  ctx.fillRect(W * 0.91, H * 0.747, W * 0.09, H * 0.158);
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.moveTo(W * 0.192, H * 0.641);
  ctx.lineTo(0, H * 0.666);
  ctx.lineTo(W * 0.192, H * 0.741);
  ctx.fill();

  const community = "Y TODA LA COMUNIDAD OWU.";
  centered(ctx, community, H * 0.8, fit(ctx, community, 800, W * 0.66, 52), 800, "#FFFFFF");

  const markW = W * 0.34;
  const markH = (markW * art.sticker.naturalHeight) / art.sticker.naturalWidth;
  ctx.drawImage(art.sticker, (W - markW) / 2, H * 0.94 - markH / 2, markW, markH);

  return canvas;
}

/*
 * One tile of the black OWU lanyard; the material repeats it along the band. Satin
 * ribbon: a sheen down the middle, the ribbed weave, lighter woven edges (they're
 * what outlines the strap against the black page) and the white logo printed
 * every so often, alternately one way up and the other.
 */
export function drawBand(canvas: HTMLCanvasElement, art: BadgeArt) {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const sheen = ctx.createLinearGradient(0, 0, 0, height);
  sheen.addColorStop(0, "#0E0E0E");
  sheen.addColorStop(0.5, "#202020");
  sheen.addColorStop(1, "#0E0E0E");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let x = 0; x < width; x += 4) ctx.fillRect(x, 0, 1.5, height);
  ctx.fillStyle = "#3A3A3A";
  ctx.fillRect(0, 0, width, 5);
  ctx.fillRect(0, height - 5, width, 5);

  const markH = height * 0.66;
  const markW = (markH * art.owu.naturalWidth) / art.owu.naturalHeight;
  [0.25, 0.75].forEach((at, i) => {
    ctx.save();
    ctx.translate(width * at, height / 2);
    ctx.rotate(i * Math.PI);
    ctx.drawImage(art.owu, -markW / 2, -markH / 2, markW, markH);
    ctx.restore();
  });

  return canvas;
}
