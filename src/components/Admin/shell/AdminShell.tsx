"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { useDispatchDue } from "components/Admin/comms/useDispatchDue";
import { ConnectionPill } from "components/Admin/ui/status";
import { Button } from "components/shared/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "components/shared/ui/sidebar";

import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTabBar } from "./AdminTabBar";
import { AnnouncementsBell, UrgentBanner } from "./announcements";
import { openCommandMenu } from "./command-bus";
import { CommandMenu } from "./CommandMenu";
import { HEADER_ACTIONS_ID } from "./HeaderActions";
import { guardedPush } from "./navigation-guard";
import { NAV_ITEMS } from "./nav-config";
import { PresenceAvatars, PresenceProvider } from "./presence";
import { ShortcutListener, ShortcutSheet, useShortcuts } from "./shortcuts";
import { ShellStatusProvider, useShell } from "./use-shell-status";
import { eventHref } from "./use-selected-event";

/** Live-control pages want every pixel: there the sidebar folds to its icon rail (⌘B still opens it). */
const FOCUS_ROUTES = ["/admin/owy/scenes", "/admin/screen"];
const isFocusRoute = (pathname: string | null) => FOCUS_ROUTES.some((route) => pathname?.startsWith(route));

/** "G" then a letter jumps to a page, from anywhere in the admin. */
function NavShortcuts() {
  const router = useRouter();
  const { scope, status } = useShell();
  const siteAdmin = status?.me.siteAdmin ?? true;

  useShortcuts([
    ...NAV_ITEMS.filter((item) => item.go && (siteAdmin || item.audience === "staff")).map((item) => ({
      id: `nav.${item.key}`,
      keys: `g ${item.go}`,
      label: `Ir a ${item.title}`,
      group: "Navegación",
      run: () => guardedPush(router, item.scoped ? eventHref(scope, item.href) : item.href),
    })),
    {
      id: "shell.sidebar",
      keys: "mod+b",
      label: "Mostrar u ocultar el menú",
      group: "General",
      run: () => {},
      displayOnly: true,
    },
  ]);

  return null;
}

function Chrome({ children, urgentHint }: { children: React.ReactNode; urgentHint: boolean }) {
  const { status, selected } = useShell();
  // There is no cron: any open admin page (site staff) sends the scheduled messages that came due.
  useDispatchDue(status?.me.siteAdmin && selected ? selected.id : null);

  return (
    <PresenceProvider enabled={status?.me.siteAdmin ?? false}>
      <AdminSidebar />
      <SidebarInset className="min-w-0 [--admin-content-h:calc(100dvh-46px-env(safe-area-inset-top)-var(--admin-banner-h,0px)-var(--admin-tabbar-h,0px))] md:[--admin-content-h:calc(100svh-1rem-48px-var(--admin-banner-h,0px))]">
        {/* Insets are 0 in a browser tab; installed as an app (viewport-fit=cover) they clear the notch. */}
        <header className="sticky top-0 z-40 flex h-[calc(46px+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border bg-background pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
          <SidebarTrigger className="-ml-0.5 size-7 shrink-0 text-muted-foreground hover:text-foreground" />
          <span aria-hidden className="h-4 w-px shrink-0 bg-input" />
          <AdminBreadcrumbs />
          {/* Pages put their own controls here (HeaderActions). */}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2" id={HEADER_ACTIONS_ID} />
          <div className="flex shrink-0 items-center gap-2">
            <PresenceAvatars />
            <span aria-hidden className="h-4 w-px bg-input max-sm:hidden" />
            <ConnectionPill />
            <AnnouncementsBell />
            {/* Phones, and any touchscreen: a tablet's sidebar may be folded away, and there's no ⌘K. */}
            <Button
              aria-label="Buscar o ejecutar"
              className="md:hidden pointer-coarse:inline-flex"
              size="icon-sm"
              variant="ghost"
              onClick={() => openCommandMenu()}
            >
              <Search />
            </Button>
          </div>
        </header>
        <UrgentBanner hint={urgentHint} />
        <div className="flex min-w-0 flex-1 scrollbar-thin flex-col md:min-h-0 md:overflow-y-auto" id="admin-scroll">
          {/* Room for the phone tab bar, whenever it is on screen (the scenes desk brings its own). */}
          <main className="min-w-0 flex-1 pb-(--admin-tabbar-h,0px)">{children}</main>
        </div>
      </SidebarInset>
      <AdminTabBar />
      <CommandMenu />
      <ShortcutSheet />
      <ShortcutListener />
      <NavShortcuts />
    </PresenceProvider>
  );
}

/** Below this the expanded sidebar leaves a tablet in portrait ~520px: it starts folded. */
const NARROW = "(min-width: 768px) and (max-width: 1023.98px)";

export function AdminShell({
  children,
  defaultOpen = true,
  sidebarChosen = false,
  urgentHint = false,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** The operator opened or folded the sidebar themselves (its cookie): their choice stands. */
  sidebarChosen?: boolean;
  /** An urgent banner was up on this device's last page load (see UrgentBanner). */
  urgentHint?: boolean;
}) {
  const pathname = usePathname();
  const focus = isFocusRoute(pathname);
  const [open, setOpen] = useState(focus ? false : defaultOpen);
  /** What the operator chose on the other pages, restored when they leave a focus page. */
  const preferred = useRef(defaultOpen);
  const chosen = useRef(sidebarChosen);

  useEffect(() => {
    setOpen(focus ? false : preferred.current);
  }, [focus]);

  // Until the operator chooses, the sidebar follows the window: folded on a tablet in portrait
  // (or a narrow window), open from 1024px. The guess is remembered apart from a choice, so the
  // next load renders it right away.
  useEffect(() => {
    if (chosen.current) return;
    const query = window.matchMedia(NARROW);
    const follow = () => {
      if (chosen.current) return;
      const next = !query.matches;
      document.cookie = `sidebar:auto=${next ? "open" : "folded"}; path=/; max-age=31536000; samesite=lax`;
      preferred.current = next;
      if (!isFocusRoute(window.location.pathname)) setOpen(next);
    };
    follow();
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  const changeOpen = (next: boolean) => {
    chosen.current = true;
    setOpen(next);
    if (!focus) preferred.current = next;
  };

  // Safari keeps the layout viewport tall when the keyboard opens. Size
  // admin dialogs to the visible viewport so their actions stay reachable.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--admin-viewport-height", `${viewport.height}px`);
      root.style.setProperty("--admin-viewport-top", `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--admin-viewport-height");
      root.style.removeProperty("--admin-viewport-top");
    };
  }, []);

  return (
    <SidebarProvider className="bg-app bg-grain" data-admin-shell="" open={open} onOpenChange={changeOpen}>
      <ShellStatusProvider>
        <Chrome urgentHint={urgentHint}>{children}</Chrome>
      </ShellStatusProvider>
    </SidebarProvider>
  );
}
