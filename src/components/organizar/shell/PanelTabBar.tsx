"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";

import { cn } from "app/lib/utils";
import { openNewEvent } from "components/organizar/events/NewEventDialog";
import { useSidebar } from "components/shared/ui/sidebar";

import { usePanel } from "./context";
import { PANEL_NAV_ITEMS, activePanelItem, panelHref } from "./nav";

const TABS = ["inicio", "calendario", "eventos"] as const;

/** Full-screen steps with their own action bar: the wizard and the door scanner. */
const OWN_BAR = /\/(editar|puerta\/escanear)(\/|$)/;

/** Whether the phone tab bar shows on this page (on phones): then its «Más» is the menu. */
export const hasTabBar = (pathname: string | null, inCommunity: boolean) =>
  inCommunity && !OWN_BAR.test(pathname ?? "");

/**
 * The panel's bottom bar on phones, like OWU Ops: three destinations, a centered "Nuevo evento"
 * and "Más", which opens the full menu.
 */
export function PanelTabBar() {
  const pathname = usePathname();
  const { current } = usePanel();
  const { isMobile, setOpenMobile } = useSidebar();
  if (!isMobile || !current || !hasTabBar(pathname, true)) return null;
  const active = activePanelItem(pathname, current.slug);
  const items = TABS.map((key) => PANEL_NAV_ITEMS.find((item) => item.key === key)).filter(
    (item) => item !== undefined
  );
  const tab = (item: (typeof items)[number]) => {
    const isActive = active?.key === item.key;

    return (
      <Link
        key={item.key}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "relative flex h-14 touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
        href={panelHref(current.slug, item.path)}
      >
        {isActive ? <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" /> : null}
        <item.icon aria-hidden className={cn("size-5", isActive && "text-primary")} />
        <span className="max-w-full truncate px-1">{item.title}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      data-admin-tabbar=""
    >
      <div className="grid grid-cols-5 pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        {tab(items[0])}
        {tab(items[1])}
        <button
          aria-label="Nuevo evento"
          className="flex h-14 touch-manipulation items-center justify-center"
          type="button"
          onClick={openNewEvent}
        >
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-edge">
            <Plus aria-hidden className="size-5" />
          </span>
        </button>
        {tab(items[2])}
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
