"use client";

import type React from "react";
import { useEffect } from "react";

import { signOut, useSession } from "app/lib/auth-client";
import { Separator } from "components/shared/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "components/shared/ui/sidebar";
import { UserAvatarMenu } from "components/shared/ui/user-avatar-menu";

import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminSidebar } from "./AdminSidebar";
import { CommandMenu } from "./CommandMenu";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();

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
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset className="bg-background min-w-0">
        <header className="border-border/50 sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-black/40 px-4 backdrop-blur-lg">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground -ml-1 shrink-0" />
          <Separator className="mr-2 h-4 shrink-0" orientation="vertical" />
          <AdminBreadcrumbs />
          <div className="ml-auto flex shrink-0 items-center gap-3">
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
