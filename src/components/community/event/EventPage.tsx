import type { ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { CalendarPlus, CircleSlash, Globe, MapPin, Ticket, Users } from "lucide-react";

import { cn } from "app/lib/utils";
import { Badge, ButtonLink, cardClassName, CommunityLogo, Container, headingClassName } from "components/community/ui";
import { dateParts, shortWhen } from "lib/community/time";
import { topicLabel } from "lib/community/topics";
import type { PublicEvent } from "lib/orpc/events/schemas";
import { eventJsonLd, googleCalendarUrl, safeJson } from "lib/organizar/calendar-links";

import { RsvpSheet } from "./RsvpSheet";

const FORMAT = {
  charlas: "Charlas",
  taller: "Taller",
  "open-space": "Open space",
  social: "Social",
  hackathon: "Hackathon",
  otro: "Evento",
} as const;

/** The organizer's Markdown, in the site's type: links open outside, no raw HTML */
function Description({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-4 text-[16px] leading-relaxed text-zinc-300">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h2 className={cn(headingClassName.h3, "mt-4 text-xl")}>{children}</h2>,
          h2: ({ children }) => <h2 className={cn(headingClassName.h3, "mt-4 text-xl")}>{children}</h2>,
          h3: ({ children }) => <h3 className={cn(headingClassName.h3, "mt-2")}>{children}</h3>,
          ul: ({ children }) => <ul className="ml-5 list-disc space-y-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1.5">{children}</ol>,
          a: ({ children, href }) => (
            <a
              className="text-yellow-400 underline underline-offset-4"
              href={href}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
          code: ({ children }) => (
            <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[14px] text-zinc-100">{children}</code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-yellow-400/60 pl-4 text-zinc-400">{children}</blockquote>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function Fact({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[15px] text-zinc-300">
      <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-zinc-500" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/**
 * The public page of an event made in Organizá: what, when, where, how to get in. `rsvp` is the
 * sign-up island for OWU's own registration; `banner` marks a preview.
 */
export function EventPage({
  event,
  url,
  rsvp,
  banner,
}: {
  event: PublicEvent;
  /** The page's absolute URL, for calendars, sharing and search engines */
  url: string;
  rsvp?: ReactNode;
  banner?: ReactNode;
}) {
  const start = dateParts(event.startDate);
  const end = dateParts(event.endDate);
  const cancelled = event.status === "cancelled";
  const past = Date.parse(event.endDate) < Date.now();
  const left = event.capacity === null ? null : Math.max(0, event.capacity - event.taken);

  const signUp = cancelled ? (
    <p className="flex items-center gap-2 text-[15px] text-zinc-300">
      <CircleSlash aria-hidden className="size-5 text-red-300" />
      Este evento se canceló.
    </p>
  ) : past ? (
    <p className="text-[15px] text-zinc-400">Este evento ya pasó.</p>
  ) : event.registration === "owu" ? (
    // Phones get it in a sheet from the bottom bar
    <div className="hidden lg:block">{rsvp}</div>
  ) : (event.registration === "external" || event.registration === "eventbrite") && event.registrationUrl ? (
    <ButtonLink arrow className="w-full justify-center" href={event.registrationUrl} size="lg">
      {event.registration === "eventbrite" ? "Inscribirme en Eventbrite" : "Inscribirme"}
    </ButtonLink>
  ) : event.registration === "eventbrite" ? (
    <p className="text-[15px] leading-relaxed text-zinc-300">Las inscripciones abren en Eventbrite en unos minutos.</p>
  ) : (
    <p className="text-[15px] leading-relaxed text-zinc-300">Entrada libre: no hace falta anotarse.</p>
  );

  return (
    <main className="pb-24">
      <script
        // eslint-disable-next-line react/no-danger -- JSON-LD, escaped by safeJson
        dangerouslySetInnerHTML={{ __html: safeJson(eventJsonLd(event, url, `${url}/opengraph-image`)) }}
        type="application/ld+json"
      />
      {banner}
      <Container className="pt-8 sm:pt-14">
        <nav aria-label="Ruta" className="mb-6 flex items-center gap-2 text-[13px] text-zinc-500">
          <Link className="hover:text-zinc-300" href="/eventos">
            Eventos
          </Link>
          <span aria-hidden>/</span>
          <Link className="hover:text-zinc-300" href={`/comunidad/${event.community.slug}`}>
            {event.community.name}
          </Link>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
          <article className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {event.format ? <Badge tone="accent">{FORMAT[event.format]}</Badge> : null}
              {cancelled ? <Badge className="bg-red-400/15 text-red-200">Cancelado</Badge> : null}
              {event.mode !== "presencial" ? (
                <Badge>{event.mode === "online" ? "Online" : "Presencial y online"}</Badge>
              ) : null}
            </div>
            <h1 className={cn(headingClassName.h1, "mt-4", cancelled && "text-zinc-400 line-through decoration-2")}>
              {event.name}
            </h1>
            {event.summary ? (
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-300">{event.summary}</p>
            ) : null}

            {event.description ? (
              <section className="mt-10">
                <Description markdown={event.description} />
              </section>
            ) : null}

            {event.topics.length > 0 ? (
              <ul aria-label="Temas" className="mt-10 flex flex-wrap gap-2">
                {event.topics.map((topic) => (
                  <li key={topic}>
                    <Badge>{topicLabel(topic)}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}

            <Link
              className={cardClassName(true, "mt-10 flex items-center gap-4 p-5")}
              href={`/comunidad/${event.community.slug}`}
            >
              <CommunityLogo logo={event.community.logoUrl} name={event.community.name} />
              <span className="min-w-0">
                <span className="block text-[13px] text-zinc-500">Organiza</span>
                <span className="block font-title text-lg font-semibold text-white">{event.community.name}</span>
              </span>
            </Link>
            {event.cohosts.length > 0 ? (
              <p className="mt-3 text-[14px] text-zinc-400">
                Junto con{" "}
                {event.cohosts.map((cohost, index) => (
                  <span key={cohost.slug}>
                    {index > 0 ? (index === event.cohosts.length - 1 ? " y " : ", ") : null}
                    <Link
                      className="text-zinc-200 underline-offset-4 hover:underline"
                      href={`/comunidad/${cohost.slug}`}
                    >
                      {cohost.name}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </article>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className={cardClassName(false, "flex flex-col gap-6 p-6")}>
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  <span className="text-[11px] font-medium tracking-[0.12em] text-yellow-400 uppercase">
                    {start.month}
                  </span>
                  <span className="font-title text-2xl leading-none font-bold text-white">{start.day}</span>
                </div>
                <div>
                  <p className="text-[15px] font-medium text-white first-letter:uppercase">{start.long}</p>
                  <p className="text-[15px] text-zinc-400 tabular-nums">
                    {start.time} a {end.time}
                  </p>
                </div>
              </div>

              <ul className="flex flex-col gap-3">
                {event.mode !== "online" ? (
                  <Fact icon={MapPin}>
                    {event.place ? (
                      <>
                        <span className="block font-medium text-zinc-100">{event.place.name}</span>
                        {event.place.address ? (
                          event.place.mapUrl ? (
                            <a
                              className="block text-zinc-400 underline-offset-4 hover:underline"
                              href={event.place.mapUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {event.place.address}
                            </a>
                          ) : (
                            <span className="block text-zinc-400">{event.place.address}</span>
                          )
                        ) : (
                          <span className="block text-zinc-400">
                            {event.place.area ? `${event.place.area}. ` : ""}La dirección exacta te llega al anotarte.
                          </span>
                        )}
                      </>
                    ) : (
                      "Lugar a confirmar"
                    )}
                  </Fact>
                ) : null}
                {event.mode !== "presencial" ? (
                  <Fact icon={Globe}>
                    {event.mode === "online" ? "Online" : "También online"}: el link te llega al confirmar.
                  </Fact>
                ) : null}
                {event.registration === "owu" && event.capacity !== null && !cancelled && !past ? (
                  <Fact icon={Ticket}>
                    {left === 0
                      ? "Sin lugares: anotate en la lista de espera"
                      : left === 1
                        ? "Queda 1 lugar"
                        : `Quedan ${left} lugares`}
                  </Fact>
                ) : null}
                {event.registration === "owu" && event.taken > 0 && !cancelled ? (
                  <Fact icon={Users}>
                    {event.taken === 1 ? "Va 1 persona" : `Van ${event.taken} personas`}
                    {event.going.length > 0 ? (
                      <span className="block text-[14px] text-zinc-500">
                        {new Intl.ListFormat("es").format([
                          ...event.going,
                          ...(event.taken > event.going.length ? [`${event.taken - event.going.length} más`] : []),
                        ])}
                      </span>
                    ) : null}
                  </Fact>
                ) : null}
              </ul>

              {signUp}

              {!cancelled && !past ? (
                <a
                  className="flex items-center gap-2 text-[14px] text-zinc-400 transition-colors hover:text-white"
                  href={googleCalendarUrl(event, url)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <CalendarPlus aria-hidden className="size-4" />
                  Agregar a Google Calendar
                </a>
              ) : null}
              {event.meetupUrl ? (
                <a
                  className="text-[14px] text-zinc-500 hover:text-zinc-300"
                  href={event.meetupUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  También en Meetup
                </a>
              ) : null}
              <p className="text-[13px] text-zinc-500 tabular-nums">{shortWhen(event.startDate)} · hora de Uruguay</p>
            </div>
          </aside>
        </div>
      </Container>
      {event.registration === "owu" && rsvp && !cancelled && !past ? <RsvpSheet event={event}>{rsvp}</RsvpSheet> : null}
    </main>
  );
}
