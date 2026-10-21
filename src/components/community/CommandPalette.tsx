"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { ArrowUpRight, CalendarDays, CornerDownLeft, FileText, Mic, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { SearchItem } from "lib/community/search";

import { isExternal, Kbd, outbound } from "./ui";

const GROUP_ICONS: Record<SearchItem["group"], typeof Search> = {
  Páginas: FileText,
  Comunidades: Users,
  "Próximos eventos": CalendarDays,
  Charlas: Mic,
};

const PaletteContext = createContext<{ open: () => void }>({ open: () => {} });

/** Opens the palette from anywhere inside the site chrome (navbar button, hero hints) */
export const useCommandPalette = () => useContext(PaletteContext);

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function CommandPaletteProvider({ items, children }: { items: SearchItem[]; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setIsOpen((current) => !current);
      } else if (event.key === "/" && !isTyping(event.target)) {
        event.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const groups = useMemo(() => {
    const byGroup = new Map<SearchItem["group"], SearchItem[]>();
    for (const item of items) byGroup.set(item.group, [...(byGroup.get(item.group) ?? []), item]);

    return [...byGroup.entries()];
  }, [items]);

  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      if (isExternal(href)) window.open(outbound(href, "buscador"), "_blank", "noopener");
      else router.push(href);
    },
    [router]
  );

  const context = useMemo(() => ({ open: () => setIsOpen(true) }), []);

  return (
    <PaletteContext.Provider value={context}>
      {children}
      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed top-[12vh] left-1/2 z-[95] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-line-strong bg-ink-elev shadow-[0_32px_80px_-24px_rgba(0,0,0,0.9)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
          >
            <Dialog.Title className="sr-only">Buscar en OWU</Dialog.Title>
            <Command
              loop
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-terminal [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-zinc-500 [&_[cmdk-group-heading]]:uppercase"
            >
              <div className="flex items-center gap-3 border-b border-line px-4">
                <Search aria-hidden className="size-4 shrink-0 text-zinc-500" />
                <Command.Input
                  autoFocus
                  className="h-13 w-full bg-transparent py-4 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600"
                  placeholder="Buscá comunidades, eventos, charlas…"
                />
                <Kbd>Esc</Kbd>
              </div>
              <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain p-1.5">
                <Command.Empty className="px-4 py-10 text-center text-sm text-zinc-500">
                  Nada por acá. Probá con otra palabra.
                </Command.Empty>
                {groups.map(([group, groupItems]) => {
                  const Icon = GROUP_ICONS[group];

                  return (
                    <Command.Group key={group} heading={group}>
                      {groupItems.map((item) => (
                        <Command.Item
                          key={`${group}-${item.href}-${item.label}`}
                          className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-zinc-300 data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-zinc-50"
                          keywords={[item.hint ?? "", item.keywords ?? ""]}
                          value={`${group} ${item.label}`}
                          onSelect={() => go(item.href)}
                        >
                          <Icon aria-hidden className="size-4 shrink-0 text-zinc-500 group-data-[selected=true]:text-yellow-400" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{item.label}</span>
                            {item.hint ? (
                              <span className="block truncate font-terminal text-[11px] text-zinc-500">{item.hint}</span>
                            ) : null}
                          </span>
                          {isExternal(item.href) ? (
                            <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-zinc-600" />
                          ) : (
                            <CornerDownLeft
                              aria-hidden
                              className="size-3.5 shrink-0 text-zinc-600 opacity-0 group-data-[selected=true]:opacity-100"
                            />
                          )}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })}
              </Command.List>
              <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-2.5 font-terminal text-[11px] text-zinc-600">
                <span className="flex items-center gap-1.5">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd> para moverte <Kbd>↵</Kbd> para abrir
                </span>
                <span className="hidden sm:inline">owu.uy</span>
              </div>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </PaletteContext.Provider>
  );
}
