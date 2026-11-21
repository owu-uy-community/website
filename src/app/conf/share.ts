/*
 * The shareable badge images: one design per message, rendered at each platform's size by
 * /api/conf/og. Every image says it is not a ticket — the badge is printed at the door, so
 * a shared copy must never pass for one.
 */

export const SHARE_FORMATS = {
  /** Link previews: LinkedIn, X, Facebook, WhatsApp, Slack */
  link: { width: 1200, height: 630, label: "Link", hint: "1200×630" },
  /** Feed posts: Instagram and LinkedIn (4:5 takes the most room in a feed) */
  post: { width: 1080, height: 1350, label: "Post", hint: "1080×1350" },
  /** Instagram and WhatsApp stories */
  historia: { width: 1080, height: 1920, label: "Historia", hint: "1080×1920" },
} as const;

export const SHARE_DESIGNS = {
  voy: { label: "¡Voy!", text: "¡Voy a OWU CONF!" },
  venis: { label: "¿Venís?", text: "¿Venís a OWU CONF?" },
  evento: { label: "El evento", text: "Se viene OWU CONF" },
} as const;

export type ShareFormat = keyof typeof SHARE_FORMATS;
export type ShareDesign = keyof typeof SHARE_DESIGNS;

export const NAME_MAX = 24;
export const SHARE_DISCLAIMER = "Credencial solo para compartir: no es una entrada ni da acceso al evento.";

const CONF_URL = "https://conf.owu.uy";

/** Untrusted input from a URL: trimmed, single-spaced, capped like the badge's field (at a word break when it can) */
export function cleanName(raw: string | null | undefined) {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (name.length <= NAME_MAX) return name;
  const cut = name.slice(0, NAME_MAX + 1);

  return (cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut.slice(0, NAME_MAX)).trim();
}

export function pick<T extends string>(value: string | null | undefined, options: Record<T, unknown>, fallback: T): T {
  // Own keys only: "toString" is `in` every object
  return value && Object.hasOwn(options, value) ? (value as T) : fallback;
}

/** The image itself, on this site (preview and download) */
export function shareImagePath(design: ShareDesign, format: ShareFormat, name: string) {
  const params = new URLSearchParams({ d: design, f: format });
  if (name) params.set("nombre", name);

  return `/api/conf/og?${params}`;
}

/** The page people post: its link preview is their own badge */
export function sharePageUrl(design: ShareDesign, name: string) {
  const params = new URLSearchParams({ d: design });
  if (name) params.set("nombre", name);

  return `${CONF_URL}/credencial?${params}`;
}

export function shareText(design: ShareDesign) {
  return `${SHARE_DESIGNS[design].text} Sábado 7 de noviembre en Montevideo: charlas, open space y comunidad. Entradas gratis. #OWUCONF`;
}
