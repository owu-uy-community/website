"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SOCIAL_LINKS } from "app/lib/constants";
import { cn } from "app/lib/utils";
import { ButtonLink, Eyebrow, SmartLink } from "components/community/ui";
import { NAV_LINKS, PAGES, SOCIALS } from "lib/community/site";

const SECONDARY = [PAGES.primeraVez, PAGES.darCharla, PAGES.organizar, PAGES.empresas, PAGES.semanario, PAGES.codigo];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger
        aria-label="Abrir menú"
        className="inline-flex size-9 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/[0.05] lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          className="owu-site fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-ink data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
            <Dialog.Title className="font-terminal text-xs tracking-[0.14em] text-zinc-500 uppercase">Menú</Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar menú"
              className="inline-flex size-9 items-center justify-center rounded-md text-zinc-300 hover:bg-white/[0.05]"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <nav aria-label="Principal" className="flex flex-col px-5 py-6">
            <ul className="divide-y divide-line border-y border-line">
              {NAV_LINKS.map(({ href, label, external }) => (
                <li key={href}>
                  <SmartLink
                    className={cn(
                      "flex items-center justify-between py-4 text-2xl font-semibold tracking-[-0.03em]",
                      !external && pathname.startsWith(href) ? "text-yellow-400" : "text-zinc-100"
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
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {SECONDARY.map(({ href, label }) => (
                <li key={href}>
                  <SmartLink className="text-[15px] text-zinc-400 hover:text-zinc-100" href={href} onClick={() => setIsOpen(false)}>
                    {label}
                  </SmartLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto flex flex-col gap-4 border-t border-line px-5 py-6">
            <ButtonLink arrow href={SOCIAL_LINKS.slack} size="lg" utm="menu">
              Sumate al Slack
            </ButtonLink>
            <div className="flex flex-wrap gap-x-4 gap-y-2 font-terminal text-xs text-zinc-500">
              {SOCIALS.map(({ key, label, href }) => (
                <SmartLink key={key} className="hover:text-zinc-200" href={href} utm="menu">
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
