"use client";

import type React from "react";

import { usePathname } from "next/navigation";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "components/shared/ui/sidebar";
import { Home, LayoutGrid, Monitor, Users, Music2 } from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "app/lib/auth-client";
import { UserAvatarMenu } from "components/shared/ui/user-avatar-menu";
import { AttendeesSidebarSection } from "components/Admin/Eventbrite/AttendeesSidebarSection";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-zinc-950">
        <Sidebar className="border-r border-zinc-800 bg-zinc-900">
          <SidebarHeader className="border-b border-zinc-800 p-4">
            <div className="flex items-center">
              <div className="text-xl font-bold text-yellow-400">OWU</div>
              <div className="ml-1.5 text-sm text-white/70">Admin</div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-white/70">General</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Dashboard">
                      <Link href="/admin" className="group/item">
                        <Home className="text-white transition-colors group-hover/item:text-yellow-400" />
                        <span className="text-white transition-colors group-hover/item:text-yellow-400">Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-white/70">Administración</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="OpenSpace">
                      <Link href="/admin/openspace" className="group/openspace">
                        <LayoutGrid
                          className={`transition-colors group-hover/openspace:text-yellow-400 ${pathname?.includes("/openspace") ? "text-yellow-400" : "text-white"}`}
                        />
                        <span
                          className={`transition-colors group-hover/openspace:text-yellow-400 ${pathname?.includes("/openspace") ? "text-yellow-400" : "text-white"}`}
                        >
                          OpenSpace
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Asistentes">
                      <Link href="/admin/attendees" className="group/attendees">
                        <Users
                          className={`transition-colors group-hover/attendees:text-yellow-400 ${pathname?.includes("/attendees") ? "text-yellow-400" : "text-white"}`}
                        />
                        <span
                          className={`transition-colors group-hover/attendees:text-yellow-400 ${pathname?.includes("/attendees") ? "text-yellow-400" : "text-white"}`}
                        >
                          Asistentes
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Pantalla">
                      <Link href="/admin/screen" className="group/screen">
                        <Monitor
                          className={`transition-colors group-hover/screen:text-yellow-400 ${pathname?.includes("/screen") ? "text-yellow-400" : "text-white"}`}
                        />
                        <span
                          className={`transition-colors group-hover/screen:text-yellow-400 ${pathname?.includes("/screen") ? "text-yellow-400" : "text-white"}`}
                        >
                          Pantalla
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Launchpad">
                      <Link href="/admin/launchpad" className="group/launchpad">
                        <Music2
                          className={`transition-colors group-hover/launchpad:text-yellow-400 ${pathname?.includes("/launchpad") ? "text-yellow-400" : "text-white"}`}
                        />
                        <span
                          className={`transition-colors group-hover/launchpad:text-yellow-400 ${pathname?.includes("/launchpad") ? "text-yellow-400" : "text-white"}`}
                        >
                          Launchpad
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupContent>
                <div className="px-2 py-2">
                  <AttendeesSidebarSection />
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex w-full flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center border-b border-zinc-800/50 bg-black/40 px-4 backdrop-blur-lg">
            <SidebarTrigger className="text-white hover:text-yellow-400" />
            <div className="ml-4 font-medium text-white">Panel de Administración</div>
            <div className="ml-auto flex items-center gap-4">
              {session?.user && !isPending ? (
                <UserAvatarMenu user={session.user} onSignOut={() => signOut()} showAdminSettings />
              ) : null}
            </div>
          </header>
          <main className="w-full flex-1 overflow-auto bg-zinc-950">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
