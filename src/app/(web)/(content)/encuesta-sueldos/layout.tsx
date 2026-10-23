import { AppProviders } from "components/providers/AppProviders";

/** The survey form submits through React Query */
export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
