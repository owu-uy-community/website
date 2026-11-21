/**
 * Open the command palette from anywhere (the sidebar's search field, a page's empty state)
 * without threading its state through the tree.
 */
const OPEN_EVENT = "owu-admin:command-menu";

export function openCommandMenu(query?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { query } }));
}

export function onOpenCommandMenu(listener: (query?: string) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<{ query?: string }>).detail?.query);
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
