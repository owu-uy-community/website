import { redirectToEventPage } from "../legacy-redirect";

export default async function Page({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  await redirectToEventPage("sala", event);
}
