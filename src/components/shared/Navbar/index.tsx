"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FaInstagram, FaLinkedin, FaSlack, FaTelegram } from "react-icons/fa6";

import { signOut, useSession } from "app/lib/auth-client";
import { SOCIAL_LINKS } from "app/lib/constants";
import { cn } from "app/lib/utils";
import { useCommandPalette } from "components/community/CommandPalette";
import { ButtonLink, Kbd, SmartLink } from "components/community/ui";
import { UserAvatarMenu } from "components/shared/ui/user-avatar-menu";
import { platformRolesOf } from "lib/authz/catalog";
import { NAV_LINKS } from "lib/community/site";

import MobileNav from "./mobileNav";

export const isActivePath = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

const SOCIALS = [
  { label: "Instagram", href: SOCIAL_LINKS.instagram, Icon: FaInstagram },
  { label: "LinkedIn", href: SOCIAL_LINKS.linkedin, Icon: FaLinkedin },
  { label: "Slack", href: SOCIAL_LINKS.slack, Icon: FaSlack },
  { label: "Telegram", href: SOCIAL_LINKS.telegram, Icon: FaTelegram },
];

function Navbar() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const { open } = useCommandPalette();
  const [scrolled, setScrolled] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-[60] w-full" id="site-menu">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-3 sm:px-5 lg:h-[72px]">
        {/* Transparent over the hero; once the page scrolls it becomes a floating glass bar */}
        <div
          className={cn(
            "relative flex h-14 w-full items-center gap-6 rounded-2xl border px-3 transition-[background-color,border-color,box-shadow] duration-300 sm:px-4",
            scrolled
              ? "border-white/[0.08] bg-[#19191d]/70 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
              : "border-transparent bg-transparent"
          )}
        >
          <Link aria-label="OWU Uruguay, inicio" className="flex shrink-0 items-center" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="OWU Uruguay"
              className="h-8 w-auto transition-transform duration-300 hover:scale-105 lg:h-9"
              height={36}
              src="/images/logos/owu.webp"
              width={85}
            />
          </Link>

          <nav aria-label="Principal" className="hidden h-full flex-1 lg:block">
            <ul className="flex h-full items-center justify-center gap-1">
              {NAV_LINKS.map(({ href, label, external }) => {
                const active = !external && isActivePath(pathname, href);

                return (
                  <li key={href} className="h-full">
                    <SmartLink
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-full items-center gap-1 px-3.5 text-[15px] font-medium whitespace-nowrap transition-colors",
                        active ? "text-white" : "text-zinc-300 hover:text-white"
                      )}
                      href={href}
                      utm="navbar"
                    >
                      {label}
                      {external ? <ArrowUpRight aria-hidden className="size-3.5 text-zinc-500" /> : null}
                      {active ? (
                        // OWU's marker: the yellow bar at the top of the current page, sliding between items
                        <motion.span
                          aria-hidden
                          className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-yellow-400"
                          layoutId="nav-active"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      ) : null}
                    </SmartLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
            <button
              aria-label="Buscar"
              className="hidden h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] pr-1.5 pl-3 text-sm text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200 md:inline-flex"
              type="button"
              onClick={open}
            >
              <Search aria-hidden className="size-4" />
              <span className="hidden pr-5 2xl:inline">Buscar</span>
              <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd>
            </button>
            <button
              aria-label="Buscar"
              className="inline-flex size-10 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
              type="button"
              onClick={open}
            >
              <Search aria-hidden className="size-5" />
            </button>

            <ul className="hidden items-center xl:flex">
              {SOCIALS.map(({ label, href, Icon }) => (
                <li key={label}>
                  <SmartLink
                    aria-label={label}
                    className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-yellow-400"
                    href={href}
                    utm="navbar"
                  >
                    <Icon aria-hidden className="size-[18px]" />
                  </SmartLink>
                </li>
              ))}
            </ul>

            <ButtonLink className="hidden sm:inline-flex" href={SOCIAL_LINKS.slack} size="sm" utm="navbar">
              Sumate al Slack
            </ButtonLink>
            {session?.user && !isPending ? (
              <UserAvatarMenu
                showAdminSettings={platformRolesOf(session.user.role).some((role) => role !== "user")}
                user={session.user}
                onSignOut={() => signOut()}
              />
            ) : null}
            <MobileNav />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
