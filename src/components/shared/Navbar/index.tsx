"use client";

import classNames from "classnames";
import Link from "next/link";
import { FaInstagram, FaLinkedin, FaSlack } from "react-icons/fa";

import { addUtmParams } from "app/lib/utils";
import { SOCIAL_LINKS, INTERNAL_ROUTES } from "app/lib/constants";

import MobileNav from "./mobileNav";
import { signOut, useSession } from "app/lib/auth-client";
import { UserAvatarMenu } from "components/shared/ui/user-avatar-menu";
import { useNavigationContext } from "./navigationProvider";
import { navSections, SectionKey } from "./navSections";

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
            <h1 className="hidden">OWU URUGUAY</h1>
            <img
              alt="OWU Uruguay"
              className="max-w-[90px] object-cover transition-all duration-300 hover:scale-105 lg:max-w-[110px]"
              src="/images/logos/owu.webp"
            />
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
          {session?.user && !isPending ? (
            <UserAvatarMenu
              user={session.user}
              onSignOut={() => signOut()}
              showAdminSettings={session.user.role === "admin"}
            />
          ) : null}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
