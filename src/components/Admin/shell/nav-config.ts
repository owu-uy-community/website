import {
  AudioLines,
  Bot,
  Building2,
  CalendarClock,
  Clapperboard,
  ClipboardCheck,
  DoorOpen,
  Gauge,
  LayoutGrid,
  ListVideo,
  Map,
  Megaphone,
  MonitorPlay,
  PenLine,
  Settings,
  Siren,
  StickyNote,
  Timer,
  TvMinimal,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavKey =
  | "hoy"
  | "agenda"
  | "guion"
  | "staff"
  | "asistentes"
  | "comunicacion"
  | "escenas"
  | "obs"
  | "sonidos"
  | "owy"
  | "pantallas"
  | "incidentes"
  | "mi-turno"
  | "sala"
  | "comunidades"
  | "ajustes";

export type AdminNavItem = {
  key: NavKey;
  title: string;
  /** Canonical href; event pages are rewritten to /admin/<community>/… with ?event=. */
  href: string;
  icon: LucideIcon;
  /** "exact" only marks the item active on an exact pathname match (default: prefix). */
  match?: "exact" | "prefix";
  /** Extra terms the command palette should match on. */
  keywords?: string[];
  /** Operates on the selected event: lives under the event's community. */
  scoped?: boolean;
  /** Site staff only (default), or anyone on the community's staff. */
  audience?: "site" | "staff";
  /** Second key after G ("G A" → Agenda). */
  go?: string;
};

export type AdminNavGroup = {
  key: string;
  label?: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    key: "today",
    items: [
      {
        key: "hoy",
        title: "Hoy",
        href: "/admin",
        icon: Gauge,
        match: "exact",
        scoped: true,
        go: "h",
        keywords: ["inicio", "resumen", "dashboard", "preparación", "mission control"],
      },
    ],
  },
  {
    key: "plan",
    label: "Planificar",
    items: [
      {
        key: "agenda",
        title: "Agenda",
        href: "/admin/openspace",
        icon: LayoutGrid,
        scoped: true,
        go: "a",
        keywords: ["open space", "charlas", "grilla", "board", "salas"],
      },
      {
        key: "guion",
        title: "Guion del día",
        href: "/admin/guion",
        icon: ListVideo,
        scoped: true,
        go: "g",
        keywords: ["run of show", "rundown", "cronograma", "go", "momentos"],
      },
      {
        key: "staff",
        title: "Staff y tareas",
        href: "/admin/tareas",
        icon: ClipboardCheck,
        scoped: true,
        audience: "staff",
        go: "t",
        keywords: ["tareas", "turnos", "checklist", "cronograma", "voluntarios"],
      },
      {
        key: "asistentes",
        title: "Asistentes",
        href: "/admin/attendees",
        icon: Users,
        scoped: true,
        go: "p",
        keywords: ["eventbrite", "check-in", "entradas", "acreditación", "personas"],
      },
      {
        key: "comunicacion",
        title: "Comunicación",
        href: "/admin/comunicacion",
        icon: Megaphone,
        scoped: true,
        go: "c",
        keywords: ["anuncios", "owy", "telegram", "slack", "mensajes", "encuesta"],
      },
    ],
  },
  {
    key: "live",
    label: "En vivo",
    items: [
      {
        key: "escenas",
        title: "Escenas",
        href: "/admin/owy/scenes",
        icon: Clapperboard,
        go: "e",
        keywords: ["owy", "stage", "video wall", "pantalla", "take"],
      },
      {
        key: "obs",
        title: "OBS",
        href: "/admin/screen",
        icon: MonitorPlay,
        go: "o",
        keywords: ["stream", "transmisión", "escenas obs", "cues"],
      },
      {
        key: "sonidos",
        title: "Sonidos",
        href: "/admin/launchpad",
        icon: AudioLines,
        go: "s",
        keywords: ["launchpad", "soundboard", "audio"],
      },
      {
        key: "owy",
        title: "Owy",
        href: "/admin/companion",
        icon: Bot,
        keywords: ["companion", "voz", "dispositivo", "emulador"],
      },
      {
        key: "pantallas",
        title: "Pantallas",
        href: "/admin/pantallas",
        icon: TvMinimal,
        scoped: true,
        keywords: ["kiosk", "monitores", "tv", "identificar"],
      },
      {
        key: "incidentes",
        title: "Incidentes",
        href: "/admin/incidentes",
        icon: Siren,
        scoped: true,
        audience: "staff",
        go: "i",
        keywords: ["reportes", "problemas", "código de conducta", "perdidos"],
      },
    ],
  },
  {
    key: "day",
    label: "Tu día",
    items: [
      {
        key: "mi-turno",
        title: "Mi turno",
        href: "/admin/mi-turno",
        icon: UserRoundCheck,
        scoped: true,
        audience: "staff",
        keywords: ["mis tareas", "llegué", "turno"],
      },
      {
        key: "sala",
        title: "Host de sala",
        href: "/admin/sala",
        icon: DoorOpen,
        scoped: true,
        audience: "staff",
        keywords: ["sala llena", "evacuar", "host"],
      },
    ],
  },
  {
    key: "community",
    label: "Comunidad",
    items: [
      {
        key: "comunidades",
        title: "Comunidades",
        href: "/admin/communities",
        icon: Building2,
        keywords: ["organizaciones", "eventos", "miembros"],
      },
      {
        key: "ajustes",
        title: "Ajustes",
        href: "/admin/settings",
        icon: Settings,
        keywords: ["configuración", "cuenta"],
      },
    ],
  },
];

export const NAV_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap((group) => group.items);

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
  const stage: AdminTool = {
    title: "Pantalla · Owy stage",
    href: "/owy/stage",
    icon: Clapperboard,
    keywords: ["owy", "video wall", "obs"],
  };
  if (!event) return [stage, cms];

  const base = `/comunidad/${event.communitySlug}/events/${event.slug}`;

  return [
    { title: "Kiosk · Grilla", href: `${base}/kiosk`, icon: CalendarClock, keywords: ["kiosk", "agenda"] },
    { title: "Kiosk · Mapa", href: `${base}/kiosk/map`, icon: Map, keywords: ["mapa", "salas"] },
    { title: "Pantalla · Sticky note", href: `${base}/stickynote`, icon: StickyNote, keywords: ["cast", "nota"] },
    { title: "Pantalla · Countdown", href: `${base}/countdown`, icon: Timer, keywords: ["cuenta regresiva"] },
    stage,
    cms,
  ];
}

export function isNavItemActive(pathname: string | null, item: Pick<AdminNavItem, "href" | "match">): boolean {
  if (!pathname) return false;
  if (item.match === "exact") return pathname === item.href;

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The nav item a (normalized) path belongs to, for titles and breadcrumbs. */
export function navItemFor(pathname: string | null): AdminNavItem | undefined {
  return NAV_ITEMS.find((item) => isNavItemActive(pathname, item));
}

/** Event sub-pages that aren't in the nav but still get a name in the breadcrumbs, by path segment. */
export const SUBPAGE_LABELS: Record<string, string> = {
  escanear: "Escáner",
};

/**
 * Set on this device while an urgent banner is up (UrgentBanner writes it, the admin layout reads
 * it), so the next page load holds the banner's room instead of pushing the page down.
 */
export const URGENT_COOKIE = "admin-urgent";
