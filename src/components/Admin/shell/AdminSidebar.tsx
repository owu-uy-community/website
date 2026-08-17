"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "components/shared/ui/sidebar";
import { AttendeesSidebarSection } from "components/Admin/Eventbrite/AttendeesSidebarSection";
import { cn } from "app/lib/utils";

import { ADMIN_NAV, isNavItemActive } from "./nav-config";
import { normalizeAdminPath, scopedAdminHref, useSelectedEvent } from "./use-selected-event";
import { TenantSwitcher } from "./TenantSwitcher";

export function AdminSidebar() {
  const pathname = usePathname();

  const { selected, communitySlug } = useSelectedEvent();
  // Active-state matching works on the canonical href, with the community
  // segment stripped from the current path.
  const normalizedPath = normalizeAdminPath(pathname, communitySlug);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <TenantSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {ADMIN_NAV.map((group, index) => (
          <SidebarGroup key={group.label ?? index}>
            {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isNavItemActive(normalizedPath, item);
                  // Event-scoped links live under the community's path and
                  // carry the event selection, so switching pages never
                  // silently drops back to another tenant or event.
                  const href =
                    group.eventScoped && selected
                      ? scopedAdminHref(selected.communitySlug, item.href, selected.slug)
                      : item.href;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link className="relative" href={href}>
                          {active ? (
                            <span
                              aria-hidden
                              className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary group-data-[collapsible=icon]:hidden"
                            />
                          ) : null}
                          <item.icon className={cn(active ? "text-primary" : "text-sidebar-foreground/70")} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto group-data-[collapsible=icon]:hidden">
          <SidebarGroupContent>
            <div className="px-2 py-2">
              <AttendeesSidebarSection />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
