import {
  Building2,
  CalendarClock,
  ClipboardList,
  Home,
  LayoutGrid,
  Map,
  Monitor,
  Music2,
  PenLine,
  Settings,
  StickyNote,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** "exact" only marks the item active on an exact pathname match (default: prefix). */
  match?: "exact" | "prefix";
  /** Extra terms the command palette should match on. */
  keywords?: string[];
};

export type AdminNavGroup = {
  label?: string;
  /** Items in this group operate on the selected event. */
  eventScoped?: boolean;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    items: [
      { title: "Resumen", href: "/admin", icon: Home, match: "exact", keywords: ["dashboard", "inicio", "stats"] },
    ],
  },
  {
    label: "Evento",
    eventScoped: true,
    items: [
      { title: "Open Space", href: "/admin/openspace", icon: LayoutGrid, keywords: ["charlas", "grilla", "board"] },
      { title: "Tareas", href: "/admin/tareas", icon: ClipboardList, keywords: ["staff", "checklist", "cronograma"] },
      { title: "Asistentes", href: "/admin/attendees", icon: Users, keywords: ["eventbrite", "check-in", "entradas"] },
    ],
  },
  {
    label: "En vivo",
    items: [
      { title: "Pantalla", href: "/admin/screen", icon: Monitor, keywords: ["obs", "escenas", "stream"] },
      { title: "Launchpad", href: "/admin/launchpad", icon: Music2, keywords: ["sonidos", "soundboard"] },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { title: "Comunidades", href: "/admin/communities", icon: Building2, keywords: ["tenants", "organizaciones"] },
      { title: "Ajustes", href: "/admin/settings", icon: Settings, keywords: ["settings", "configuración"] },
    ],
  },
];

export type AdminTool = { title: string; href: string; icon: LucideIcon; keywords?: string[] };

/**
 * Public screens the team opens from the admin (new tab). The display routes
 * are per-event, so they are built from the current selection rather than
 * pinned to one event.
 */
export function adminTools(event: { communitySlug: string; slug: string } | null): AdminTool[] {
  const cms: AdminTool = {
    title: "CMS de contenido (Keystatic)",
    href: "/keystatic",
    icon: PenLine,
    keywords: ["cms", "landing", "sponsors"],
  };
  if (!event) return [cms];

  const base = `/comunidad/${event.communitySlug}/events/${event.slug}`;

  return [
    { title: "Kiosk · Grilla", href: `${base}/kiosk`, icon: CalendarClock, keywords: ["kiosk", "agenda"] },
    { title: "Kiosk · Mapa", href: `${base}/kiosk/map`, icon: Map, keywords: ["mapa", "salas"] },
    { title: "Pantalla · Sticky note", href: `${base}/stickynote`, icon: StickyNote, keywords: ["cast", "nota"] },
    { title: "Pantalla · Countdown", href: `${base}/countdown`, icon: Timer, keywords: ["cuenta regresiva"] },
    cms,
  ];
}

export function isNavItemActive(pathname: string | null, item: AdminNavItem): boolean {
  if (!pathname) return false;
  if (item.match === "exact") return pathname === item.href;

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Route-segment → human label, used by the header breadcrumbs. */
export const BREADCRUMB_LABELS: Record<string, string> = {
  admin: "Admin",
  openspace: "Open Space",
  tareas: "Tareas",
  attendees: "Asistentes",
  screen: "Pantalla",
  launchpad: "Launchpad",
  settings: "Ajustes",
  communities: "Comunidades",
  events: "Eventos",
};
