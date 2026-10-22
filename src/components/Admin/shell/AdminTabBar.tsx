"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { cn } from "app/lib/utils";
import { useSidebar } from "components/shared/ui/sidebar";

import { NAV_ITEMS, isNavItemActive, type NavKey } from "./nav-config";
import { useShell } from "./use-shell-status";
import { eventHref, normalizeAdminPath, useSelectedEvent } from "./use-selected-event";

/** What a phone needs at thumb's reach: organizers run the day, the staff work their part of it. */
const SITE_TABS: NavKey[] = ["hoy", "agenda", "escenas", "incidentes"];
const STAFF_TABS: NavKey[] = ["mi-turno", "sala", "staff", "incidentes"];

/**
 * Full-screen tools with their own way around (canonical paths): the scenes desk has its own tab
 * bar, the scanner its back arrow and mode bar, and both want the room.
 */
const OWN_TABS = ["/admin/owy/scenes", "/admin/attendees/escanear"];

/**
 * The admin's bottom bar on phones, like an iOS tab bar: four destinations for the role plus
 * "Más", which opens the full menu. Above the home indicator, 56px targets.
 */
export function AdminTabBar() {
  const pathname = usePathname();
  const { scope, communitySlug } = useSelectedEvent();
  const { status } = useShell();
  const { isMobile, setOpenMobile } = useSidebar();
  const normalized = normalizeAdminPath(pathname, communitySlug);
  if (!isMobile || OWN_TABS.some((route) => normalized?.startsWith(route))) return null;

  const keys = (status?.me.siteAdmin ?? true) ? SITE_TABS : STAFF_TABS;
  const items = keys.map((key) => NAV_ITEMS.find((item) => item.key === key)).filter((item) => item !== undefined);
  const badge = (key: NavKey) =>
    key === "incidentes"
      ? (status?.counts.openIncidents ?? 0)
      : key === "staff"
        ? (status?.counts.unackedAnnouncements ?? 0)
        : 0;

  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      data-admin-tabbar=""
    >
      <div className="grid grid-cols-5 pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        {items.map((item) => {
          const active = isNavItemActive(normalized, item);
          const count = badge(item.key);
          const href = item.scoped ? eventHref(scope, item.href) : item.href;

          return (
            <Link
              key={item.key}
              aria-current={active ? "page" : undefined}
              aria-label={count ? `${item.title}, ${count}` : item.title}
              className={cn(
                "relative flex h-14 touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground"
              )}
              href={href}
            >
              {active ? <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" /> : null}
              <span className="relative">
                <item.icon aria-hidden className={cn("size-5", active && "text-primary")} />
                {count ? (
                  <span
                    className={cn(
                      "absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-bold",
                      item.key === "incidentes" && (status?.counts.criticalIncidents ?? 0) > 0
                        ? "bg-live text-white"
                        : "bg-primary text-primary-foreground"
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate px-1">{item.title}</span>
            </Link>
          );
        })}
        <button
          className="flex h-14 touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
          type="button"
          onClick={() => setOpenMobile(true)}
        >
          <Menu aria-hidden className="size-5" />
          Más
        </button>
      </div>
    </nav>
  );
}
