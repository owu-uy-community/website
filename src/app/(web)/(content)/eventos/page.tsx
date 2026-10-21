import { CalendarX } from "lucide-react";
import Link from "next/link";

import CalendarSubscribe from "components/community/CalendarSubscribe";
import { ButtonLink, Container, Eyebrow, Freshness, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { getUpcomingEvents } from "lib/community/events";
import { pageMetadata } from "lib/community/metadata";
import { issueFormUrl, PAGES } from "lib/community/site";

import AgendaExplorer from "./AgendaExplorer";

// meetup-bot is polled hourly; hand-added events ship with the deploy
export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Eventos",
  description:
    "Meetups, talleres y conferencias de las comunidades tech de Uruguay, en un solo lugar y con un calendario para suscribirte.",
  path: PAGES.eventos.href,
});

export default async function EventsPage() {
  const events = await getUpcomingEvents();

  return (
    <>
      <PageHeader
        description="Meetups, talleres y conferencias de las comunidades, en un solo lugar. La lista se actualiza cada hora."
        eyebrow="Agenda"
        title="Eventos tech en Uruguay"
      >
        <div className="owu-rise mt-10 max-w-2xl rounded-xl border border-line bg-ink/70 p-5 backdrop-blur sm:p-6">
          <CalendarSubscribe />
        </div>
      </PageHeader>

      <section className="py-12 sm:py-16">
        <Container>
          {events.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line-strong px-6 py-20 text-center">
              <CalendarX aria-hidden className="size-8 text-zinc-600" />
              <p className="text-lg font-medium text-zinc-200">No hay eventos agendados por ahora</p>
              <p className="max-w-md text-sm text-zinc-400">
                Suscribite al calendario y te enterás apenas aparezca uno. Si organizás algo, sumalo.
              </p>
              <ButtonLink arrow href={issueFormUrl("publicar-evento")} size="sm" utm="eventos-vacio">
                Publicá tu evento
              </ButtonLink>
            </div>
          ) : (
            <AgendaExplorer events={events} />
          )}

          <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-[1.4fr_1fr]">
            <div className="bg-ink p-6 sm:p-8">
              <Eyebrow dot>¿Organizás algo?</Eyebrow>
              <h2 className="mt-4 text-2xl leading-tight font-semibold tracking-[-0.03em] text-zinc-50">
                Publicá tu evento en la agenda
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-zinc-400">
                Si tu grupo está en el{" "}
                <Link
                  className="text-zinc-200 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                  href={PAGES.comunidades.href}
                >
                  directorio
                </Link>{" "}
                y publica en Meetup.com, sus eventos aparecen solos. Si usás otra plataforma, o es algo puntual, mandanos
                los datos y lo sumamos a mano.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3 bg-ink p-6 sm:p-8">
              <ButtonLink arrow href={issueFormUrl("publicar-evento")} utm="eventos-publicar">
                Publicá tu evento
              </ButtonLink>
              <ButtonLink href={issueFormUrl("sumar-comunidad")} utm="eventos-sumar" variant="secondary">
                Sumá tu comunidad al directorio
              </ButtonLink>
            </div>
          </div>

          <Freshness className="mt-6">
            Fuentes: meetup-bot (grupos de Meetup.com) y la carga manual en content/events · Horarios de Montevideo
          </Freshness>
        </Container>
      </section>

      <Footer />
    </>
  );
}
