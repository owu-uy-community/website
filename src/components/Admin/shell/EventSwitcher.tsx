"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

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
import { CommunityMark } from "components/shared/CommunityMark";
import { orpc } from "lib/orpc";

import { NAV_ITEMS, isNavItemActive } from "./nav-config";
import { guardedPush } from "./navigation-guard";
import { normalizeAdminPath, scopedAdminHref, useSelectedEvent } from "./use-selected-event";

const dayFormat = new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "numeric", month: "short" });

/** "sáb 7 nov". */
function eventDay(iso: string) {
  return dayFormat.format(new Date(iso)).replace(/\./g, "").replace(",", "");
}

/**
 * The admin's scope selector: community and event in one control, because
 * picking an event already implies its community — two separate pickers could
 * disagree with each other. Switching keeps the page you're on.
 */
export function EventSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: communities } = useQuery(
    orpc.communities.list.queryOptions({ input: { includeInactive: true }, staleTime: 60_000 })
  );
  const { events, selected, communitySlug } = useSelectedEvent();

  const normalized = normalizeAdminPath(pathname, communitySlug);
  const here = NAV_ITEMS.find((item) => isNavItemActive(normalized, item));
  const community = communities?.find((candidate) => candidate.id === selected?.communityId);

  const goTo = (event: (typeof events)[number]) => {
    if (here && !here.scoped) {
      // A page outside any event (OBS, Escenas…): stay, only the selection moves.
      guardedPush(router, `${pathname}?event=${encodeURIComponent(event.slug)}`);
      return;
    }
    // Keep the sub-page (Agenda, Guion, Asistentes…) when it is an event page.
    const subpath = here?.scoped ? (normalized ?? "/admin") : "/admin";
    guardedPush(router, scopedAdminHref(event.communitySlug, subpath, event.slug));
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="h-[52px] gap-2.5 px-1.5 group-data-[collapsible=icon]:!p-0 hover:bg-raised data-[state=open]:bg-raised"
              size="lg"
              title="Cambiar de evento"
            >
              <CommunityMark
                logoUrl={community?.logoUrl}
                name={selected?.communityName ?? "OWU"}
                slug={selected?.communitySlug ?? "owu"}
              />
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-ui font-semibold text-foreground">{selected?.name ?? "Sin evento"}</span>
                <span className="truncate text-2xs text-muted-foreground">
                  {selected ? `${selected.communityName} · ${eventDay(selected.startDate)}` : "Elegí o creá un evento"}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-faint" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-72" side="bottom">
            {(communities ?? []).map((item, index) => {
              const communityEvents = events.filter((event) => event.communityId === item.id);

              return (
                <div key={item.id}>
                  {index > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel className="flex items-center gap-2 normal-case">
                    <CommunityMark logoUrl={item.logoUrl} name={item.name} size={18} slug={item.slug} />
                    <span className="truncate font-sans text-meta tracking-normal">{item.name}</span>
                  </DropdownMenuLabel>

                  {communityEvents.length === 0 ? (
                    <DropdownMenuItem asChild className="pl-8 text-muted-foreground">
                      <Link href={`/admin/communities/${item.slug}`}>
                        <Plus className="size-3.5" />
                        Crear un evento
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    communityEvents.map((event) => (
                      <DropdownMenuItem key={event.id} onSelect={() => goTo(event)}>
                        <Check
                          className={cn(
                            "size-3.5 !text-primary",
                            event.id === selected?.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="grid flex-1 leading-tight">
                          <span className="truncate">{event.name}</span>
                          <span className="truncate font-terminal text-2xs text-muted-foreground">
                            {eventDay(event.startDate)}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              );
            })}

            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="text-muted-foreground">
              <Link href="/admin/communities">
                <Plus />
                Gestionar comunidades
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
