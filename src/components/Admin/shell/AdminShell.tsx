"use client";

import type React from "react";

import { signOut, useSession } from "app/lib/auth-client";
import { Separator } from "components/shared/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "components/shared/ui/sidebar";
import { UserAvatarMenu } from "components/shared/ui/user-avatar-menu";

import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminSidebar } from "./AdminSidebar";
import { CommandMenu } from "./CommandMenu";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();

  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-black/40 px-4 backdrop-blur-lg">
          <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
          <Separator className="mr-2 h-4" orientation="vertical" />
          <AdminBreadcrumbs />
          <div className="ml-auto flex items-center gap-3">
            <CommandMenu />
            {session?.user && !isPending ? (
              <UserAvatarMenu showAdminSettings user={session.user} onSignOut={() => signOut()} />
            ) : null}
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
