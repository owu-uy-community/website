import { CalendarDays, House, MapPin, PlugZap, Ticket, UserRound, Users, type LucideIcon } from "lucide-react";

export type PanelNavKey = "inicio" | "calendario" | "eventos" | "espacios" | "perfil" | "equipo" | "integraciones";

export type PanelNavItem = {
  key: PanelNavKey;
  title: string;
  /** Under the community: "" is its Inicio, "calendario" is /organizar/panel/<slug>/calendario. */
  path: string;
  icon: LucideIcon;
  /** Second key after G ("G C" → Calendario). */
  go?: string;
};

export const PANEL_NAV: { key: string; label?: string; items: PanelNavItem[] }[] = [
  { key: "home", items: [{ key: "inicio", title: "Inicio", path: "", icon: House, go: "i" }] },
  {
    key: "organizar",
    label: "Organizar",
    items: [
      { key: "calendario", title: "Calendario", path: "calendario", icon: CalendarDays, go: "c" },
      { key: "eventos", title: "Eventos", path: "eventos", icon: Ticket, go: "e" },
      { key: "espacios", title: "Espacios", path: "espacios", icon: MapPin, go: "s" },
    ],
  },
  {
    key: "comunidad",
    label: "Comunidad",
    items: [
      { key: "perfil", title: "Perfil", path: "perfil", icon: UserRound },
      { key: "equipo", title: "Equipo", path: "equipo", icon: Users },
      { key: "integraciones", title: "Integraciones", path: "integraciones", icon: PlugZap },
    ],
  },
];

export const PANEL_NAV_ITEMS = PANEL_NAV.flatMap((group) => group.items);

export const PANEL_ROOT = "/organizar/panel";

export const panelHref = (communitySlug: string, path = "") =>
  path ? `${PANEL_ROOT}/${communitySlug}/${path}` : `${PANEL_ROOT}/${communitySlug}`;

/** The nav item a path belongs to: Inicio only on an exact match, the others by prefix. */
export function activePanelItem(pathname: string | null, communitySlug: string | null) {
  if (!pathname || !communitySlug) return undefined;
  const base = panelHref(communitySlug);

  return PANEL_NAV_ITEMS.find((item) =>
    item.path ? pathname === `${base}/${item.path}` || pathname.startsWith(`${base}/${item.path}/`) : pathname === base
  );
}

/** Which community the panel opens on: the last one used on this device. */
export const LAST_COMMUNITY_COOKIE = "organizar:community";

export const ROLE_LABEL = { owner: "Dueño", admin: "Admin", editor: "Editor", member: "Miembro" } as const;
