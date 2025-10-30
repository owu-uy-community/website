"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldCheck, LogOut } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "components/shared/ui/avatar";
import { Button } from "components/shared/ui/button";
import { INTERNAL_ROUTES } from "app/lib/constants";
import { getGravatarUrl } from "lib/gravatar";

interface UserAvatarMenuProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  onSignOut: () => void;
  showAdminSettings?: boolean;
  variant?: "default" | "compact";
}

export function UserAvatarMenu({
  user,
  onSignOut,
  showAdminSettings = false,
  variant = "default",
}: UserAvatarMenuProps) {
  const initials = user.name?.charAt(0) ?? user.email?.charAt(0) ?? "U";

  // Use Gravatar if user has email, fallback to provided image or default
  const avatarUrl = user.email ? getGravatarUrl(user.email, 200, "identicon") : (user.image ?? "");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full hover:bg-yellow-400/10">
          <Avatar className="h-8 w-8 cursor-pointer">
            <AvatarImage src={avatarUrl} alt={user.name || user.email || "User avatar"} />
            <AvatarFallback className="bg-yellow-400 text-black">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 border-zinc-800 bg-zinc-900" align="end" sideOffset={15}>
        {/* <DropdownMenuItem
          className="cursor-pointer text-white hover:bg-zinc-800 hover:text-yellow-400 focus:bg-zinc-800 focus:text-yellow-400"
          asChild
        >
          <Link href={INTERNAL_ROUTES.auth.profile}>
            <UserCircle size={16} className="mr-2" />
            Mi Perfil
          </Link>
        </DropdownMenuItem> */}
        {/* <DropdownMenuItem
          className="cursor-pointer text-white hover:bg-zinc-800 hover:text-yellow-400 focus:bg-zinc-800 focus:text-yellow-400"
          asChild
        >
          <Link href={INTERNAL_ROUTES.auth.community}>
            <Handshake size={16} className="mr-2" />
            Comunidad
          </Link>
        </DropdownMenuItem> */}

        {showAdminSettings && (
          <DropdownMenuItem
            className="cursor-pointer text-white hover:bg-zinc-800 hover:text-yellow-400 focus:bg-zinc-800 focus:text-yellow-400"
            asChild
          >
            <Link href="/admin">
              <ShieldCheck size={16} className="mr-2" />
              Admin
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="bg-zinc-800" />
        <DropdownMenuItem
          onClick={onSignOut}
          className="cursor-pointer text-red-400 hover:bg-red-900/30 hover:text-red-300 focus:bg-red-900/30 focus:text-red-300"
        >
          <LogOut size={16} className="mr-2" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
