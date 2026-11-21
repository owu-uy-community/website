"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { SUBPAGE_LABELS, navItemFor } from "./nav-config";
import { normalizeAdminPath, scopedAdminHref, useSelectedEvent } from "./use-selected-event";

type Crumb = { label: string; href?: string };

/** Where you are, in names: "OWU CONF 2026 › Agenda", "Comunidades › OWU › OWU CONF 2026". */
export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const params = useParams();
  const { events, selected, communitySlug } = useSelectedEvent();
  const normalized = normalizeAdminPath(pathname, communitySlug) ?? "/admin";
  const item = navItemFor(normalized);

  const crumbs: Crumb[] = [];
  if (normalized.startsWith("/admin/communities")) {
    const slug = typeof params?.slug === "string" ? params.slug : null;
    const eventSlug = typeof params?.eventSlug === "string" ? params.eventSlug : null;
    const community = events.find((event) => event.communitySlug === slug);
    crumbs.push({ label: "Comunidades", href: slug ? "/admin/communities" : undefined });
    if (slug)
      crumbs.push({
        label: community?.communityName ?? slug,
        href: eventSlug ? `/admin/communities/${slug}` : undefined,
      });
    if (slug && eventSlug) {
      crumbs.push({
        label: events.find((event) => event.communitySlug === slug && event.slug === eventSlug)?.name ?? eventSlug,
      });
    }
  } else if (item?.scoped && selected) {
    crumbs.push({
      label: selected.name,
      href: item.key === "hoy" ? undefined : scopedAdminHref(selected.communitySlug, "/admin", selected.slug),
    });
    if (item.key === "hoy") crumbs.push({ label: "Hoy" });
    else {
      // A sub-page ("Asistentes › Escáner") links back to its page.
      const sub = SUBPAGE_LABELS[normalized.slice(item.href.length + 1)];
      crumbs.push({
        label: item.title,
        href: sub ? scopedAdminHref(selected.communitySlug, item.href, selected.slug) : undefined,
      });
      if (sub) crumbs.push({ label: sub });
    }
  } else {
    crumbs.push({ label: item?.title ?? "Admin" });
  }

  // A phone shows only the last crumb, and an installed app has no browser back button: a page
  // below a nav destination (a community, an event's settings, the scanner) links to its parent.
  const parent = item && normalized !== item.href ? crumbs.at(-2) : undefined;

  return (
    <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-1.5 text-ui">
      {parent?.href ? (
        <Link
          aria-label={`Volver a ${parent.label}`}
          className="touch-target -ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors active:bg-input md:hidden"
          href={parent.href}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </Link>
      ) : null}
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 ? <ChevronRight aria-hidden className="size-3.5 shrink-0 text-faint max-md:hidden" /> : null}
            {last ? (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {crumb.label}
              </span>
            ) : crumb.href ? (
              <Link
                className="touch-target shrink-0 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground max-md:hidden"
                href={crumb.href}
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="shrink-0 truncate text-muted-foreground max-md:hidden">{crumb.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
