"use client";

import classNames from "classnames";
import Link from "next/link";
import { FaInstagram, FaLinkedin, FaSlack } from "react-icons/fa";

import { addUtmParams } from "app/lib/utils";
import { SOCIAL_LINKS, INTERNAL_ROUTES } from "app/lib/constants";

import { navSections, SectionKey } from "./navSections";
import { useNavigationContext } from "components/shared/Navbar/navigationProvider";
import MobileNav from "./mobileNav";
import { Avatar, AvatarFallback, AvatarImage } from "components/shared/ui/avatar";
import { signOut, useSession } from "app/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { Handshake, LogIn, LogOut, UserCircle } from "lucide-react";

export interface NavItemProps {
  title: string;
  link: string;
  isActive?: boolean;
}

function NavItem({ title, link, isActive }: NavItemProps) {
  return (
    <Link
      className={classNames(
        "block border-[6px] border-transparent py-4 font-medium transition-colors ease-out hover:bg-yellow-400/5 lg:rounded-b-xl lg:pb-2 lg:pt-3",
        {
          "border-l-yellow-400 font-bold lg:border-l-transparent lg:border-t-yellow-400": isActive,
        }
      )}
      href={link}
    >
      {title}
    </Link>
  );
}

function Navbar() {
  const { activeSection } = useNavigationContext();
  const { data: session, isPending } = useSession();
  return (
    <nav
      className="sticky top-[-1px] z-[60] mx-auto flex h-full max-h-[56px] w-full bg-opacity-25 bg-gradient-to-b from-[#1d1e1757] via-transparent to-transparent py-4 backdrop-blur-lg backdrop-filter"
      id="site-menu"
    >
      <div className="container flex flex-row items-center justify-between">
        <div className="flex h-full min-w-[140px] items-center">
          <Link className="flex h-full flex-col justify-center" href={navSections[SectionKey.Hero].link}>
            <h2 className="text-base font-semibold text-white hover:text-yellow-400">OWU URUGUAY</h2>
          </Link>
        </div>
        <ul className="hidden w-full max-w-[700px] md:text-base lg:flex lg:justify-center lg:self-center lg:py-0 xl:flex">
          {Object.values(navSections).map(({ link, title, id }) => {
            return (
              <li key={link} className="text-base text-white lg:flex-1 lg:text-center">
                <NavItem isActive={activeSection === id} link={link} title={title} />
              </li>
            );
          })}
        </ul>
        <div className="flex h-full items-center lg:hidden">
          <MobileNav />
        </div>
        <div className="hidden items-center justify-center gap-4 lg:flex">
          <Link
            className="font-light text-white hover:text-yellow-400"
            href={addUtmParams(SOCIAL_LINKS.instagram)}
            rel="noopener"
            target="_blank"
          >
            <FaInstagram size={20} />
          </Link>
          <Link
            className="font-light text-white hover:text-yellow-400"
            href={addUtmParams(SOCIAL_LINKS.linkedin)}
            rel="noopener"
            target="_blank"
          >
            <FaLinkedin size={20} />
          </Link>
          <Link
            className="font-light text-white hover:text-yellow-400"
            href={addUtmParams(SOCIAL_LINKS.slack)}
            target="_blank"
          >
            <FaSlack size={20} />
          </Link>
          {/* TODO: Add a dropdown menu with the user's name and email */}
          {session?.user && !isPending ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={!session?.user}>
                <Avatar className="cursor-pointer">
                  <AvatarImage src={session?.user?.image ?? ""} />
                  <AvatarFallback>{session?.user?.name?.charAt(0) ?? ""}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent sideOffset={15} align="end">
                <DropdownMenuItem>
                  <UserCircle size={16} />
                  <Link href={INTERNAL_ROUTES.auth.profile}>Mi Perfil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Handshake size={16} />
                  <Link href={INTERNAL_ROUTES.auth.community}>Comunidad</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut size={16} />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href={INTERNAL_ROUTES.auth.login} className="font-light text-white hover:text-yellow-400">
              <LogIn size={20} />
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
