import { CalendarX } from "lucide-react";
import Link from "next/link";

import CalendarSubscribe from "components/community/CalendarSubscribe";
import { Reveal } from "components/community/motion";
import {
  ButtonLink,
  cardClassName,
  Container,
  Eyebrow,
  Freshness,
  PageHeader,
  TitleBar,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { getUpcomingEvents } from "lib/community/events";
import { pageMetadata } from "lib/community/metadata";
import { issueFormUrl, MEETUP_BOT_REPO, PAGES, SLACK_CHANNELS } from "lib/community/site";

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
      />

      <section className="py-12 sm:py-16">
        <Container>
          {events.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/15 px-6 py-20 text-center">
              <CalendarX aria-hidden className="size-8 text-zinc-600" />
              <p className="font-title text-lg font-semibold text-white">No hay eventos agendados por ahora</p>
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

          {/* After the list: whoever scrolled this far is the one who wants the next one in their calendar */}
          <Reveal className="mt-16">
            <div className={cardClassName(false, "p-6 sm:p-8")}>
              <CalendarSubscribe wide />
            </div>
          </Reveal>

          <Reveal className="mt-6">
            <div className={cardClassName(false, "grid gap-8 p-8 md:grid-cols-[1.4fr_1fr] md:items-center sm:p-10")}>
              <div>
                <Eyebrow>¿Organizás algo?</Eyebrow>
                <h2 className="mt-4 font-title text-2xl leading-tight font-bold tracking-[-0.02em] text-white sm:text-3xl">
                  Publicá tu evento en la agenda
                </h2>
                <TitleBar className="mt-5" />
                <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-zinc-400">
                  La agenda sale del bot de la comunidad, que cada lunes también publica los próximos meetups en #
                  {SLACK_CHANNELS.anuncios}. Si tu grupo está en Meetup.com, sumalo con un PR al{" "}
                  <a
                    className="text-zinc-200 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                    href={MEETUP_BOT_REPO}
                    rel="noopener"
                    target="_blank"
                  >
                    repo del bot
                  </a>{" "}
                  o pedilo en #{SLACK_CHANNELS.organizers}, y sus eventos aparecen solos. Si usás otra plataforma, o es
                  algo puntual, mandanos los datos y lo sumamos a mano.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <ButtonLink arrow href={issueFormUrl("publicar-evento")} utm="eventos-publicar">
                  Publicá tu evento
                </ButtonLink>
                <ButtonLink href={issueFormUrl("sumar-comunidad")} utm="eventos-sumar" variant="secondary">
                  Sumá tu comunidad al directorio
                </ButtonLink>
              </div>
            </div>
          </Reveal>

          <Freshness className="mt-6">
            Fuentes: meetup-bot (grupos de Meetup.com) y la carga manual en content/events · Horarios de Montevideo
          </Freshness>
        </Container>
      </section>

      <Footer />
    </>
  );
}
