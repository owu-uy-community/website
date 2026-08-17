"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { orpc } from "lib/orpc";
import { cn } from "app/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "components/shared/ui/sidebar";

import { normalizeAdminPath, scopedAdminHref, useSelectedEvent } from "./use-selected-event";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

function CommunityBadge({ name, isHome }: { name: string; isHome: boolean }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-sm font-display text-[10px] font-extrabold",
        isHome ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-foreground"
      )}
    >
      {name.slice(0, 3).toUpperCase()}
    </span>
  );
}

/**
 * The admin's scope selector: community and event in one control, because
 * picking an event already implies its community — two separate pickers could
 * disagree with each other. The choice is written to `?event=` on the current
 * route, so it is shareable and survives a refresh.
 */
export function TenantSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: communities } = useQuery(
    orpc.communities.list.queryOptions({ input: { includeInactive: true }, staleTime: 60_000 })
  );
  const { events, selected, communitySlug } = useSelectedEvent();

  // Keep the current subpage when jumping to another community/event; from a
  // non-scoped page (settings, screen…) land on the board.
  const normalized = normalizeAdminPath(pathname, communitySlug);
  const subpath = normalized?.match(/^\/admin\/(openspace|tareas|attendees)/)?.[0] ?? "/admin/openspace";

  const activeCommunity =
    communities?.find((community) => community.slug === communitySlug) ??
    communities?.find((community) => community.id === selected?.communityId) ??
    communities?.find((community) => community.slug === "owu") ??
    communities?.[0];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size="lg"
              title="Cambiar de comunidad o evento"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary font-display text-sm font-extrabold text-primary-foreground">
                {(activeCommunity?.name ?? "OWU").slice(0, 3).toUpperCase()}
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold text-sidebar-foreground">
                  {activeCommunity?.name ?? "OWU Uruguay"}
                </span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  {selected?.name ?? (communities ? "Sin eventos" : "…")}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-72" side="bottom">
            {(communities ?? []).map((community, index) => {
              const communityEvents = events.filter((event) => event.communityId === community.id);

              return (
                <div key={community.id}>
                  {index > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    <CommunityBadge isHome={community.slug === "owu"} name={community.name} />
                    <span className="truncate">{community.name}</span>
                  </DropdownMenuLabel>

                  {communityEvents.length === 0 ? (
                    <DropdownMenuItem asChild className="gap-2 pl-8 text-muted-foreground">
                      <Link href={`/admin/communities/${community.slug}`}>
                        <Plus className="size-3.5" />
                        Crear un evento
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    communityEvents.map((event) => (
                      <DropdownMenuItem
                        key={event.id}
                        className="gap-2"
                        onClick={() => router.push(scopedAdminHref(event.communitySlug, subpath, event.slug))}
                      >
                        <Check className={cn("size-3.5", event.id === selected?.id ? "opacity-100" : "opacity-0")} />
                        <span className="grid flex-1 leading-tight">
                          <span className="truncate text-sm">{event.name}</span>
                          <span className="truncate font-terminal text-[10px] text-muted-foreground">
                            {formatDate(event.startDate)}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              );
            })}

            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 text-muted-foreground">
              <Link href="/admin/communities">
                <Plus className="size-4" />
                Gestionar comunidades
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
