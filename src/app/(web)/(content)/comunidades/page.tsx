import { ButtonLink, Container, Freshness, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { getCommunities } from "lib/community/content";
import { getUpcomingEvents, nextEventByCommunity } from "lib/community/events";
import { pageMetadata } from "lib/community/metadata";
import { issueFormUrl, PAGES, sourceUrl } from "lib/community/site";

import CommunitiesExplorer from "./CommunitiesExplorer";

// Each group's next date comes from the hourly events feed
export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Comunidades",
  description:
    "Las comunidades tech de Uruguay que forman OWU: de qué se trata cada una, dónde se juntan y cuándo es su próximo evento.",
  path: PAGES.comunidades.href,
});

const reviewedFormat = new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function CommunitiesPage() {
  const [communities, events] = await Promise.all([getCommunities(), getUpcomingEvents()]);
  const nextEvents = Object.fromEntries(nextEventByCommunity(events));
  const lastReview = communities
    .map((community) => community.reviewedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink arrow href={issueFormUrl("sumar-comunidad")} utm="comunidades-header">
              Sumá tu comunidad
            </ButtonLink>
            <ButtonLink href={PAGES.organizar.href} variant="secondary">
              Organizá con OWU
            </ButtonLink>
          </>
        }
        description={
          <>
            {communities.length} comunidades que organizan meetups, charlas y talleres en Uruguay. Cada una tiene su
            propia agenda; OWU las conecta con un Slack, un calendario y una conferencia.
          </>
        }
        eyebrow="Directorio"
        title="Las comunidades de OWU"
      />

      <section className="py-12 sm:py-16">
        <Container>
          <CommunitiesExplorer communities={communities} nextEvents={nextEvents} />
          <Freshness className="mt-8">
            {lastReview ? `Revisado por última vez en ${reviewedFormat.format(new Date(lastReview))} · ` : null}
            Datos en content/communities · ¿Algo cambió?{" "}
            <a
              className="text-zinc-400 underline decoration-white/20 underline-offset-4 hover:text-zinc-100 hover:decoration-yellow-400"
              href={sourceUrl("content/communities")}
              rel="noopener"
              target="_blank"
            >
              Editalo en GitHub
            </a>
          </Freshness>
        </Container>
      </section>

      <Footer />
    </>
  );
}
