import { AppProviders } from "components/providers/AppProviders";

/** The Owy screens use React Query (stage state, realtime) */
export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
