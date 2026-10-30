import { AppProviders } from "components/providers/AppProviders";

/** A host answers a space request through React Query */
export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
