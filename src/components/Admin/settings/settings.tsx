"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import { ConfirmDialog, FieldError } from "components/Admin/panel";
import { setNavigationGuard } from "components/Admin/shell/navigation-guard";
import { KeyHint, useShortcuts } from "components/Admin/shell/shortcuts";
import { MicroLabel, Panel } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";

/**
 * One pattern for every settings page (Ajustes, a community, an event): an index of the
 * page's sections, cards of rows (label and hint left, control right), and a floating bar
 * that holds the unsaved changes until they are saved or discarded.
 */

export type SettingsSectionLink = { id: string; label: string; icon: LucideIcon };

/** Which section is being read: the first one crossing the upper part of the viewport. */
function useActiveSection(ids: string[]) {
  const key = ids.join(" ");
  const [active, setActive] = useState(ids[0]);
  // A jump scrolls past other sections; the one clicked wins until the scroll settles.
  const pinnedUntil = useRef(0);

  useEffect(() => {
    const order = key.split(" ");
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = order.find((id) => visible.has(id));
        if (first && Date.now() > pinnedUntil.current) setActive(first);
      },
      { rootMargin: "-12% 0px -55% 0px" }
    );
    for (const id of order) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }

    return () => observer.disconnect();
  }, [key]);

  const jumpTo = (id: string) => {
    pinnedUntil.current = Date.now() + 900;
    setActive(id);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  };

  return [active, jumpTo] as const;
}

/** The section index (a sticky rail on desktop, a row of chips on a phone) and the page beside it. */
export function SettingsLayout({
  label,
  sections,
  children,
}: {
  /** What the sections belong to ("Evento", "Comunidad"): the index's heading. */
  label: string;
  sections: SettingsSectionLink[];
  children: ReactNode;
}) {
  const [active, jumpTo] = useActiveSection(sections.map((section) => section.id));

  const links = (chips: boolean) =>
    sections.map(({ id, label: text, icon: Icon }) => {
      const current = active === id;

      return (
        <a
          key={id}
          aria-current={current ? "location" : undefined}
          className={cn(
            "flex shrink-0 items-center whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
            chips
              ? "touch-target h-8 gap-1.5 rounded-full border px-3 text-meta"
              : "h-8 gap-2.5 rounded-[7px] px-2.5 text-ui pointer-coarse:h-10",
            chips
              ? current
                ? "border-input bg-raised text-foreground"
                : "border-border text-muted-foreground"
              : current
                ? "bg-raised text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]"
                : "text-muted-foreground hover:bg-raised/60 hover:text-foreground"
          )}
          href={`#${id}`}
          onClick={(event) => {
            event.preventDefault();
            jumpTo(id);
          }}
        >
          <Icon aria-hidden className={cn("size-4 shrink-0", current ? "text-primary" : "text-muted-foreground")} />
          {text}
        </a>
      );
    });

  return (
    <div className="flex min-h-full">
      <aside className="w-[220px] shrink-0 border-r border-border max-md:hidden">
        <nav aria-label={label} className="sticky top-0 p-4">
          <MicroLabel className="mb-2 block px-2.5">{label}</MicroLabel>
          <div className="flex flex-col gap-0.5">{links(false)}</div>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <nav
          aria-label={label}
          className="sticky top-[calc(46px+env(safe-area-inset-top))] z-20 flex [scrollbar-width:none] gap-1.5 overflow-x-auto border-b border-border bg-background px-4 py-2 md:hidden"
        >
          {links(true)}
        </nav>
        {children}
      </div>
    </div>
  );
}

/** A titled group of the page, an anchor of the index. */
export function SettingsSection({
  id,
  title,
  actions,
  children,
  className,
}: {
  id: string;
  title: string;
  /** Right of the title: a secondary action for the whole section. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={cn("scroll-mt-28 md:scroll-mt-6", className)} id={id}>
      <div className="mb-2 flex min-h-7 items-end justify-between gap-3">
        <h2 id={`${id}-title`}>
          <MicroLabel>{title}</MicroLabel>
        </h2>
        {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The card a section's rows sit in. Its rows lay out by the card's own width, not the screen's: beside the
 * sidebar and the index, a tablet's card is a phone's width.
 */
export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Panel className={cn("@container px-4 md:px-5", className)}>{children}</Panel>;
}

/**
 * One setting: label and hint on the left, the control on the right (stacked on a phone).
 * `compact` keeps a small control (a switch, a button) beside its label at every width.
 */
export function SettingsRow({
  label,
  hint,
  htmlFor,
  dirty = false,
  error,
  compact = false,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** The control's id, so the label focuses it. */
  htmlFor?: string;
  /** Changed and not saved yet. */
  dirty?: boolean;
  error?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  const title = (
    <>
      {label}
      {dirty ? (
        <>
          <StatusDot tone="brand" />
          <span className="sr-only">(sin guardar)</span>
        </>
      ) : null}
    </>
  );
  const titleClass = "flex items-center gap-2 text-ui font-medium text-foreground";

  return (
    <div
      className={cn(
        "grid gap-x-8 gap-y-2.5 border-b border-border py-4 last:border-b-0",
        compact ? "grid-cols-[minmax(0,1fr)_auto] items-center" : "@xl:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)]"
      )}
    >
      <div className={cn("min-w-0", !compact && "@xl:pt-1.5")}>
        {htmlFor ? (
          <label className={titleClass} htmlFor={htmlFor}>
            {title}
          </label>
        ) : (
          <p className={titleClass}>{title}</p>
        )}
        {hint ? <div className="mt-0.5 text-meta text-muted-foreground">{hint}</div> : null}
      </div>
      <div className={cn("min-w-0", !compact && "@xl:w-[22rem]")}>
        {children}
        <FieldError message={error} />
      </div>
    </div>
  );
}

/** Rows that are still loading, in the card's own rhythm. */
export function SettingsRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid gap-x-8 gap-y-2.5 border-b border-border py-4 last:border-b-0 @xl:grid-cols-[minmax(0,1fr)_22rem]"
        >
          <div className="space-y-2 @xl:pt-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

/** How many fields of a react-hook-form `dirtyFields` tree changed. */
export function countDirty(fields: object): number {
  return Object.values(fields).reduce<number>(
    (total, value) => total + (value === true ? 1 : value && typeof value === "object" ? countDirty(value) : 0),
    0
  );
}

const changes = (count: number) => (count === 1 ? "1 cambio" : `${count} cambios`);

/**
 * The floating "N cambios sin guardar · Descartar · Guardar ⌘S" bar, at the bottom of the
 * page while something changed. ⌘S saves from anywhere on the page, fields included; with
 * nothing to save it still keeps the browser's "save page" dialog away.
 */
export function SaveBar({
  count,
  saving,
  onSave,
  onDiscard,
}: {
  count: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  useShortcuts([
    {
      id: "settings.save",
      keys: "mod+s",
      label: "Guardar los cambios",
      group: "Ajustes",
      allowInInputs: true,
      priority: 10,
      run: () => {
        if (count > 0 && !saving) onSave();
      },
    },
  ]);

  if (count === 0) return null;

  return (
    <div className="pointer-events-none sticky bottom-[max(1rem,calc(var(--admin-tabbar-h,0px)+0.75rem),env(safe-area-inset-bottom))] z-30 mt-8 flex justify-center">
      <div
        aria-label="Cambios sin guardar"
        data-save-bar=""
        className="pointer-events-auto flex w-full max-w-[560px] items-center gap-3 rounded-xl border border-input bg-popover py-2 pr-2 pl-4 shadow-overlay motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
        role="region"
      >
        <StatusDot tone="brand" />
        <span aria-live="polite" className="min-w-0 truncate text-ui text-foreground">
          {changes(count)} sin guardar
        </span>
        <Button className="ml-auto" disabled={saving} size="sm" variant="ghost" onClick={onDiscard}>
          Descartar
        </Button>
        <Button disabled={saving} size="sm" onClick={onSave}>
          {saving ? "Guardando…" : "Guardar"}
          <span className="max-md:hidden">
            <KeyHint keys="mod+s" />
          </span>
        </Button>
      </div>
    </div>
  );
}

/**
 * While there are unsaved changes, leaving asks first: closing or reloading the tab through
 * the browser's own prompt, following a link inside the admin through a confirm dialog. Links
 * belong to the shell too (sidebar, breadcrumbs, menus), so the clicks are caught on the
 * document, before the link's own handler runs.
 */
export function UnsavedChangesGuard({ count }: { count: number }) {
  const router = useRouter();
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  const dirty = count > 0;

  // ⌘K and the shortcuts navigate from code: they ask here too.
  useEffect(
    () =>
      dirty
        ? setNavigationGuard((href) => {
            setLeavingTo(href);
            return "held";
          })
        : undefined,
    [dirty]
  );

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download"))
        return;
      const url = new URL(anchor.href, window.location.href);
      // Another site is a full page load: the browser's prompt covers it.
      if (url.origin !== window.location.origin) return;
      // Same page (the section index): nothing is lost.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setLeavingTo(`${url.pathname}${url.search}${url.hash}`);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return (
    <ConfirmDialog
      confirmLabel="Salir sin guardar"
      description={`Tenés ${changes(count)} sin guardar en esta página. Si salís ahora, se pierden.`}
      open={leavingTo !== null}
      title="¿Salir sin guardar?"
      onConfirm={() => {
        const href = leavingTo;
        setLeavingTo(null);
        if (href) router.push(href);
      }}
      onOpenChange={(open) => {
        if (!open) setLeavingTo(null);
      }}
    />
  );
}
