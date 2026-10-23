import { AppProviders } from "components/providers/AppProviders";

/** The call for talks proposes and edits through React Query */
export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
