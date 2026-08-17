"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "components/shared/ui/command";
import { Kbd } from "components/shared/ui/kbd";
import { Button } from "components/shared/ui/button";

import { adminTools, ADMIN_NAV } from "./nav-config";
import { scopedAdminHref, useSelectedEvent } from "./use-selected-event";

export function CommandMenu() {
  const router = useRouter();
  const { selected } = useSelectedEvent();
  const tools = adminTools(selected);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function runCommand(command: () => void) {
    setOpen(false);
    command();
  }

  return (
    <>
      <Button
        className="h-8 w-8 p-0 text-muted-foreground md:w-56 md:justify-start md:gap-2 md:px-3"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden className="h-4 w-4" />
        <span className="hidden text-sm font-normal md:inline-flex">Buscar…</span>
        <Kbd className="ml-auto hidden md:inline-flex">⌘K</Kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar páginas y acciones…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          {ADMIN_NAV.map((group, index) => (
            <CommandGroup key={group.label ?? index} heading={group.label ?? "General"}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.href}
                  keywords={item.keywords}
                  value={item.title}
                  onSelect={() =>
                    runCommand(() =>
                      router.push(
                        group.eventScoped && selected
                          ? scopedAdminHref(selected.communitySlug, item.href, selected.slug)
                          : item.href
                      )
                    )
                  }
                >
                  <item.icon aria-hidden className="mr-2 h-4 w-4" />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Pantallas y herramientas">
            {tools.map((tool) => (
              <CommandItem
                key={tool.href}
                keywords={tool.keywords}
                value={tool.title}
                onSelect={() => runCommand(() => window.open(tool.href, "_blank", "noopener,noreferrer"))}
              >
                <tool.icon aria-hidden className="mr-2 h-4 w-4" />
                {tool.title}
                <ExternalLink aria-hidden className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
