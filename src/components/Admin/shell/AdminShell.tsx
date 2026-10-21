"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { signOut, useSession } from "app/lib/auth-client";
import { Separator } from "components/shared/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "components/shared/ui/sidebar";
import { UserAvatarMenu } from "components/shared/ui/user-avatar-menu";

import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminSidebar } from "./AdminSidebar";
import { CommandMenu } from "./CommandMenu";
import { HEADER_ACTIONS_ID } from "./HeaderActions";

/** Live-control pages want every pixel: there the sidebar folds to its icon rail (⌘B still opens it). */
const FOCUS_ROUTES = ["/admin/owy/scenes"];
const isFocusRoute = (pathname: string | null) => FOCUS_ROUTES.some((route) => pathname?.startsWith(route));

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const focus = isFocusRoute(pathname);
  const [open, setOpen] = useState(!focus);
  /** What the operator chose on the other pages, restored when they leave a focus page. */
  const preferred = useRef(true);

  useEffect(() => {
    setOpen(focus ? false : preferred.current);
  }, [focus]);

  const changeOpen = (next: boolean) => {
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
    <SidebarProvider open={open} onOpenChange={changeOpen}>
      <AdminSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-black/40 px-4 backdrop-blur-lg">
          <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground hover:text-foreground" />
          <Separator className="mr-2 h-4 shrink-0" orientation="vertical" />
          <AdminBreadcrumbs />
          {/* Pages put their own controls here (HeaderActions). */}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2" id={HEADER_ACTIONS_ID} />
          <div className="flex shrink-0 items-center gap-3">
            <CommandMenu />
            {session?.user && !isPending ? (
              <UserAvatarMenu showAdminSettings user={session.user} onSignOut={() => signOut()} />
            ) : null}
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
