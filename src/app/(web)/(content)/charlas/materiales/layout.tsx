import { AppProviders } from "components/providers/AppProviders";

/** The speaker's materials form posts through React Query */
export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
