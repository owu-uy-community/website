import { AppProviders } from "components/providers/AppProviders";

/** The preview renders the event page, RSVP card included */
export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
