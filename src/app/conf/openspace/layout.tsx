import { AppProviders } from "components/providers/AppProviders";

/** The live board reads through React Query (the kiosk's hooks); the rest of /conf ships without it */
export default function OpenSpaceLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
