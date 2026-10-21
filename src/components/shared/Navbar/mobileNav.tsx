"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SOCIAL_LINKS } from "app/lib/constants";
import { cn } from "app/lib/utils";
import { ButtonLink, Eyebrow, SmartLink } from "components/community/ui";
import { isHiddenPath } from "lib/community/flags";
import { NAV_LINKS, PAGES, SOCIALS } from "lib/community/site";

const SECONDARY = [
  PAGES.primeraVez,
  PAGES.darCharla,
  PAGES.organizar,
  PAGES.empresas,
  PAGES.semanario,
  PAGES.codigo,
].filter((page) => !isHiddenPath(page.href));

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger
        aria-label="Abrir menú"
        className="inline-flex size-10 items-center justify-center rounded-xl text-zinc-200 transition-colors hover:bg-white/[0.06] lg:hidden"
      >
        <Menu aria-hidden className="size-6" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          className="owu-site fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-[#09090b] data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden"
        >
          <div aria-hidden className="owu-furnace pointer-events-none absolute inset-x-0 top-0 h-80" />
          <div className="relative flex h-16 shrink-0 items-center justify-between px-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="OWU Uruguay" className="h-8 w-auto" height={32} src="/images/logos/owu.webp" width={75} />
            <Dialog.Title className="sr-only">Menú</Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar menú"
              className="inline-flex size-10 items-center justify-center rounded-xl text-zinc-200 hover:bg-white/[0.06]"
            >
              <X aria-hidden className="size-6" />
            </Dialog.Close>
          </div>
          <nav aria-label="Principal" className="relative flex flex-col px-5 pt-6 pb-4">
            <ul className="flex flex-col">
              {NAV_LINKS.map(({ href, label, external }, index) => (
                <li
                  key={href}
                  className="owu-rise border-b border-white/[0.07]"
                  style={{ "--d": `${index * 50}ms` } as React.CSSProperties}
                >
                  <SmartLink
                    className={cn(
                      "flex items-center justify-between py-4 font-title text-[28px] font-bold tracking-[-0.02em]",
                      !external && pathname.startsWith(href) ? "text-yellow-400" : "text-white"
                    )}
                    href={href}
                    utm="menu"
                    onClick={() => setIsOpen(false)}
                  >
                    {label}
                    {external ? <ArrowUpRight aria-hidden className="size-5 text-zinc-500" /> : null}
                  </SmartLink>
                </li>
              ))}
            </ul>
            <Eyebrow className="mt-8">Participá</Eyebrow>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              {SECONDARY.map(({ href, label }) => (
                <li key={href}>
                  <SmartLink
                    className="text-[15px] text-zinc-400 transition-colors hover:text-white"
                    href={href}
                    onClick={() => setIsOpen(false)}
                  >
                    {label}
                  </SmartLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="relative mt-auto flex flex-col gap-5 px-5 py-6">
            <ButtonLink arrow href={SOCIAL_LINKS.slack} size="lg" utm="menu">
              Sumate al Slack
            </ButtonLink>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-500">
              {SOCIALS.map(({ key, label, href }) => (
                <SmartLink key={key} className="transition-colors hover:text-white" href={href} utm="menu">
                  {label}
                </SmartLink>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
