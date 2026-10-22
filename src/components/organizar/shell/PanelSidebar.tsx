"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Ellipsis, ExternalLink, Flag, LogOut, ShieldCheck } from "lucide-react";

import { signOut, useSession } from "app/lib/auth-client";
import { cn } from "app/lib/utils";
import { PersonAvatar } from "components/Admin/ui/person";
import { StatusDot } from "components/Admin/ui/status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "components/shared/ui/sidebar";
import { useMounted } from "hooks/useMounted";

import { usePanel, type PanelCommunity } from "./context";
import { PANEL_NAV, PANEL_ROOT, ROLE_LABEL, activePanelItem, panelHref } from "./nav";

/** The community's logo tile, or its initials on the brand surface when it has none. */
export function CommunityMark({
  community,
  size = 28,
}: {
  community: Pick<PanelCommunity, "name" | "logoUrl">;
  size?: number;
}) {
  if (community.logoUrl) {
    return (
      <Image
        alt=""
        className="shrink-0 rounded-[7px] border border-input object-cover"
        height={size}
        src={community.logoUrl}
        style={{ width: size, height: size }}
        width={size}
      />
    );
  }
  const initials = community.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[7px] border border-input bg-raised font-display text-[11px] font-bold text-primary"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

function CommunitySwitcher() {
  const { communities, current } = usePanel();
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          className="h-12 gap-2.5 px-1.5 group-data-[collapsible=icon]:!p-0.5 data-[state=open]:bg-raised"
          size="lg"
        >
          {current ? (
            <CommunityMark community={current} size={30} />
          ) : (
            <span className="grid size-[30px] place-items-center rounded-[7px] border border-input bg-raised">
              <Flag className="size-4 text-muted-foreground" />
            </span>
          )}
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-ui font-semibold text-foreground">{current?.name ?? "Organizá"}</span>
            <span className="truncate font-terminal text-2xs text-muted-foreground">
              {current ? ROLE_LABEL[current.role] : "Elegí una comunidad"}
            </span>
          </span>
          <ChevronsUpDown className="ml-auto size-4 text-faint" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="font-terminal text-[10.5px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
          Tus comunidades
        </DropdownMenuLabel>
        {communities.map((community) => (
          <DropdownMenuItem key={community.id} asChild>
            <Link href={panelHref(community.slug)} onClick={close}>
              <CommunityMark community={community} size={20} />
              <span className="truncate">{community.name}</span>
              {community.id === current?.id ? <Check className="ml-auto !text-primary" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`${PANEL_ROOT}/reclamar`} onClick={close}>
            <Flag />
            Organizar otra comunidad
          </Link>
        </DropdownMenuItem>
        {current ? (
          <DropdownMenuItem asChild>
            <Link href={`/comunidad/${current.slug}`} target="_blank">
              <ExternalLink />
              Ver el perfil público
            </Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserRow() {
  const { data: session } = useSession();
  const { isStaff, current } = usePanel();
  const mounted = useMounted();
  const user = session?.user;
  if (!mounted || !user) return <div aria-hidden className="h-11" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="h-11 gap-2.5 px-1.5 group-data-[collapsible=icon]:!p-0.5" size="lg">
          <PersonAvatar image={user.image} name={user.name} size={28} />
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-meta font-medium text-foreground">{user.name}</span>
            <span className="truncate text-2xs text-muted-foreground">
              {isStaff ? "Staff del sitio" : current ? `${ROLE_LABEL[current.role]} · ${current.name}` : "Organizador"}
            </span>
          </span>
          <Ellipsis className="ml-auto size-4 text-faint" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" side="top">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/" target="_blank">
            <ExternalLink />
            Ver el sitio
          </Link>
        </DropdownMenuItem>
        {isStaff ? (
          <DropdownMenuItem asChild>
            <Link href="/admin/communities">
              <ShieldCheck />
              Pedidos de organizadores
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-live-foreground focus:text-live-foreground" onSelect={() => signOut()}>
          <LogOut className="!text-live-foreground" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PanelSidebar() {
  const pathname = usePathname();
  const { current } = usePanel();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const active = activePanelItem(pathname, current?.slug ?? null);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-2 p-1.5 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <CommunitySwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin gap-0 pt-2">
        {current
          ? PANEL_NAV.map((group) => (
              <SidebarGroup key={group.key} className="py-1.5">
                {group.label ? (
                  <SidebarGroupLabel className="h-6 px-2 font-terminal text-[10.5px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                    {group.label}
                  </SidebarGroupLabel>
                ) : null}
                <SidebarGroupContent>
                  <SidebarMenu className="gap-px">
                    {group.items.map((item) => {
                      const isActive = active?.key === item.key;

                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            asChild
                            className={cn(
                              "relative h-[30px] gap-2.5 rounded-[7px] px-2 text-ui text-subtle hover:bg-raised hover:text-foreground data-[active=true]:bg-raised data-[active=true]:font-normal data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_hsl(var(--border))] pointer-coarse:h-10",
                              state === "collapsed" && "justify-center"
                            )}
                            isActive={isActive}
                            tooltip={item.title}
                          >
                            <Link
                              href={panelHref(current.slug, item.path)}
                              onClick={() => isMobile && setOpenMobile(false)}
                            >
                              {isActive ? (
                                <span
                                  aria-hidden
                                  className="absolute inset-y-[7px] -left-1.5 w-0.5 rounded-full bg-primary group-data-[collapsible=icon]:hidden"
                                />
                              ) : null}
                              <item.icon
                                className={cn("!size-4", isActive ? "text-primary" : "text-muted-foreground")}
                              />
                              <span className="truncate group-data-[collapsible=icon]:hidden">{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          : null}
      </SidebarContent>

      <SidebarFooter className="gap-1.5 p-1.5">
        {current ? (
          <div className="rounded-[10px] border border-border bg-card p-3 shadow-edge group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2">
              <StatusDot tone="brand" />
              <span className="font-terminal text-2xs tracking-[0.14em] text-primary uppercase">Organizá</span>
            </div>
            <p className="mt-2 text-meta text-muted-foreground">
              Calendario sin choques, espacios y tus eventos, en un solo lugar.
            </p>
          </div>
        ) : null}
        <SidebarMenu>
          <SidebarMenuItem>
            <UserRow />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail className="pointer-coarse:hidden" />
    </Sidebar>
  );
}
