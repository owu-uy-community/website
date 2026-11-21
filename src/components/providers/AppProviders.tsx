import { Toaster } from "components/shared/ui/sonner";

import { QueryProvider } from "./QueryProvider";

/**
 * React Query and the toaster, for the routes whose components use them: the admin, Organizá, the
 * Owy screens, the community and event pages and a few forms. They aren't in the root layout, so
 * the community site's content pages (home, agenda, talks, blog, conf) skip both libraries. A new
 * page using useQuery or toast() outside those trees needs a layout with this.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
      <Toaster />
    </QueryProvider>
  );
}
