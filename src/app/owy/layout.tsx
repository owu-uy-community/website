import { AppProviders } from "components/providers/AppProviders";

// Live screens (the wall, the desk's monitors): rendered per request, allowed to block (Cache Components)
export const instant = false;

/** The Owy screens use React Query (stage state, realtime) */
export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
