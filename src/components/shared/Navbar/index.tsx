"use client";

import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { signOut, useSession } from "app/lib/auth-client";
import { SOCIAL_LINKS } from "app/lib/constants";
import { cn } from "app/lib/utils";
import { useCommandPalette } from "components/community/CommandPalette";
import { ButtonLink, Kbd, SmartLink } from "components/community/ui";
import { UserAvatarMenu } from "components/shared/ui/user-avatar-menu";
import { NAV_LINKS } from "lib/community/site";

import MobileNav from "./mobileNav";

export const isActivePath = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

function Navbar() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const { open } = useCommandPalette();
  const [scrolled, setScrolled] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-[60] w-full border-b backdrop-blur-md transition-[background-color,border-color] duration-300",
        scrolled ? "border-line bg-ink/80" : "border-transparent bg-ink/30"
      )}
      id="site-menu"
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link aria-label="OWU Uruguay, inicio" className="flex shrink-0 items-center" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="OWU Uruguay"
            className="h-7 w-auto transition-transform duration-300 hover:scale-105"
            height={28}
            src="/images/logos/owu.webp"
            width={66}
          />
        </Link>

        <nav aria-label="Principal" className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, external }) => {
              const active = !external && isActivePath(pathname, href);

              return (
                <li key={href}>
                  <SmartLink
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative inline-flex h-9 items-center gap-1 rounded-md px-3 text-[13.5px] tracking-[-0.005em] transition-colors",
                      active ? "text-zinc-50" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                    )}
                    href={href}
                    utm="navbar"
                  >
                    {label}
                    {external ? <ArrowUpRight aria-hidden className="size-3 text-zinc-500" /> : null}
                    {active ? (
                      <span aria-hidden className="absolute inset-x-3 -bottom-[11px] h-px bg-yellow-400" />
                    ) : null}
                  </SmartLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            aria-label="Buscar"
            className="hidden h-8 items-center gap-2 rounded-md border border-line bg-white/[0.02] pr-1.5 pl-2.5 text-[13px] text-zinc-500 transition-colors hover:border-line-strong hover:text-zinc-300 md:inline-flex"
            type="button"
            onClick={open}
          >
            <Search aria-hidden className="size-3.5" />
            <span className="pr-6">Buscar</span>
            <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd>
          </button>
          <button
            aria-label="Buscar"
            className="inline-flex size-9 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100 md:hidden"
            type="button"
            onClick={open}
          >
            <Search aria-hidden className="size-4" />
          </button>
          <ButtonLink className="hidden sm:inline-flex" href={SOCIAL_LINKS.slack} size="sm" utm="navbar">
            Sumate al Slack
          </ButtonLink>
          {session?.user && !isPending ? (
            <UserAvatarMenu
              showAdminSettings={session.user.role === "admin"}
              user={session.user}
              onSignOut={() => signOut()}
            />
          ) : null}
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

export default Navbar;
