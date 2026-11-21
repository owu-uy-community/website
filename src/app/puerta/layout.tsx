import { AppProviders } from "components/providers/AppProviders";

/** The door scanner checks people in through React Query */
export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
