/**
 * Navigation that code starts (⌘K, the G shortcuts, the event switcher) asks the page first, the
 * way a click on a link does: a page with unsaved changes registers a guard that can hold the
 * navigation and run it later, once the person confirms.
 */
type Guard = (href: string) => "allow" | "held";

let current: Guard | null = null;

export function setNavigationGuard(guard: Guard) {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

export function guardedPush(router: { push: (href: string) => void }, href: string) {
  if (current?.(href) === "held") return;
  router.push(href);
}
