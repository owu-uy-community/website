import { ArrowRight, BookOpen, Building2, CalendarDays, MessagesSquare, Mic, Newspaper, PiggyBank, Users } from "lucide-react";
import Link from "next/link";

import { CONF_DATES, SOCIAL_LINKS } from "app/lib/constants";
import { cn } from "app/lib/utils";
import CalendarSubscribe from "components/community/CalendarSubscribe";
import { EventList, splitThisWeek } from "components/community/events";
import HeroOrbit from "components/community/home/HeroOrbit";
import Polaroids from "components/community/home/Polaroids";
import RotatingWord from "components/community/home/RotatingWord";
import { Reveal } from "components/community/motion";
import TalkCard from "components/community/TalkCard";
import Timeline from "components/community/Timeline";
import {
  AnnouncementPill,
  Badge,
  ButtonLink,
  Card,
  cardClassName,
  Cells,
  CommunityLogo,
  Container,
  delay,
  Eyebrow,
  headingClassName,
  Section,
  SmartLink,
  StatStrip,
  TitleBar,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { RichText } from "components/shared/RichText";
import { getCommunities, getLanding, getTalks } from "lib/community/content";
import { getUpcomingEvents, nextEventByCommunity } from "lib/community/events";
import { CONF_URL, issueFormUrl, PAGES, SITE_URL, SOCIALS } from "lib/community/site";
import { dateParts } from "lib/community/time";

import { PUBLISHER_LOGO, serializeJsonLd } from "../blog/(posts)/post-metadata";

// The event feed refreshes hourly; the rest is content that ships with the deploy
export const revalidate = 3600;

const STEPS = [
  {
    icon: MessagesSquare,
    title: "Sumate al Slack",
    body: "Más de 5.000 personas. Presentate, elegí los canales de tus temas y preguntá sin miedo.",
    href: SOCIAL_LINKS.slack,
    cta: "Entrar al Slack",
  },
  {
    icon: CalendarDays,
    title: "Vení a una meetup",
    body: "Son gratis y abiertas. Si es tu primera vez, te contamos qué esperar.",
    href: PAGES.primeraVez.href,
    cta: "Primera vez",
  },
  {
    icon: Mic,
    title: "Dá una charla",
    body: "No hace falta ser experto: si resolviste un problema, ya tenés una charla.",
    href: PAGES.darCharla.href,
    cta: "Cómo empezar",
  },
  {
    icon: Users,
    title: "Organizá o dá una mano",
    body: "Sumá tu comunidad, armá un grupo nuevo o ayudá en OWU CONF.",
    href: PAGES.organizar.href,
    cta: "Organizar",
  },
];

const PHOTOS = [
  { src: "/images/conf/gallery/momento-09.webp", alt: "Foto grupal de los asistentes a La Meetup III", caption: "La Meetup III" },
  { src: "/images/conf/gallery/momento-08.webp", alt: "Facilitación del Mercado de Ideas en el escenario", caption: "Mercado de ideas" },
  { src: "/images/conf/gallery/momento-12.webp", alt: "Mesa de acreditación con stickers de la comunidad", caption: "¡stickers!" },
  { src: "/images/conf/gallery/momento-14.webp", alt: "El equipo organizador celebrando sobre el escenario", caption: "el equipo ♥" },
];

const RESOURCES = [
  { icon: Newspaper, ...PAGES.semanario, tag: "Cada lunes" },
  { icon: PiggyBank, ...PAGES.encuesta, tag: "Datos abiertos" },
  {
    icon: BookOpen,
    href: "/blog?tag=guias",
    label: "Guías",
    description: "Empezar en tech en Uruguay, trabajar para afuera y más",
    tag: "Blog",
  },
];

const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "OWU Uruguay",
      alternateName: "OWU — Open Web Uruguay",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: PUBLISHER_LOGO },
      sameAs: SOCIALS.map(({ href }) => href),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "OWU Uruguay",
      url: SITE_URL,
      inLanguage: "es",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

const formatCount = (value: number) => new Intl.NumberFormat("es-UY").format(value);

export default async function Landing() {
  const [landing, events, communities, talks] = await Promise.all([
    getLanding(),
    getUpcomingEvents(),
    getCommunities(),
    getTalks(),
  ]);

  const words = landing?.titles?.length ? landing.titles : ["Conectamos"];
  const stats = landing?.stats ?? [];
  const people = stats.find((stat) => stat.title === "Personas" && stat.subtitle === "conectadas")?.count;

  const nextByCommunity = nextEventByCommunity(events);
  const { thisWeek, later } = splitThisWeek(events);
  const pastTalks = talks.filter((talk) => Date.parse(talk.date) <= Date.now());

  // Groups with something on the calendar lead the grid
  const featured = [...communities].sort(
    (a, b) =>
      Number(nextByCommunity.has(b.slug)) - Number(nextByCommunity.has(a.slug)) || Number(!!b.logo) - Number(!!a.logo)
  );
  const orbit = communities
    .filter((community) => community.logo)
    .map(({ slug, name, logo }) => ({ slug, name, logo: logo! }));

  const confUpcoming = Date.now() < Date.parse(CONF_DATES.event) + 8 * 3_600_000;
  const conf = dateParts(CONF_DATES.event);

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="owu-furnace pointer-events-none absolute inset-0 -z-10" />
        <HeroOrbit tiles={orbit} />
        <Container className="relative flex min-h-[min(calc(100svh-4.5rem),880px)] flex-col items-center justify-center pt-20 pb-24 text-center sm:pt-24 sm:pb-28">
          <div className="owu-rise" style={delay(0)}>
            {confUpcoming ? (
              <AnnouncementPill href={CONF_URL} label="OWU CONF 2026" utm="hero-pill">
                {conf.weekday} {conf.day} {conf.month} · Sinergia Faro
              </AnnouncementPill>
            ) : events[0] ? (
              <AnnouncementPill href={PAGES.eventos.href} label="Próximo">
                {events[0].title}
              </AnnouncementPill>
            ) : null}
          </div>

          <h1 className={cn(headingClassName.display, "mt-8 max-w-4xl")}>
            <span className="owu-rise-clip">
              <span className="owu-rise-line" style={delay(60)}>
                <RotatingWord words={words} />
              </span>
            </span>{" "}
            <span className="owu-rise-clip">
              <span className="owu-rise-line" style={delay(180)}>
                en comunidad.
              </span>
            </span>
          </h1>

          <p
            className="owu-rise mt-7 max-w-xl text-lg leading-relaxed text-pretty text-zinc-300 sm:text-xl"
            style={delay(300)}
          >
            {landing?.description ??
              "Un espacio donde personas apasionadas por la tecnología se reúnen, comparten y convierten sus ideas en realidad."}
          </p>

          <div className="owu-rise mt-10 flex flex-wrap items-center justify-center gap-3" style={delay(400)}>
            <ButtonLink arrow href={SOCIAL_LINKS.slack} size="lg" utm="hero">
              Sumate al Slack
            </ButtonLink>
            <ButtonLink href="#agenda" size="lg" variant="secondary">
              Ver la agenda
            </ButtonLink>
          </div>

          <p
            className="owu-rise mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-zinc-500"
            style={delay(520)}
          >
            {people ? (
              <>
                <span>
                  <strong className="font-semibold text-zinc-200">{formatCount(people)}+</strong> personas
                </span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span>
              <strong className="font-semibold text-zinc-200">{communities.length}</strong> comunidades
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong className="font-semibold text-zinc-200">{events.length}</strong> eventos en agenda
            </span>
            <span aria-hidden>·</span>
            <Link className="text-zinc-300 underline decoration-white/20 underline-offset-4 transition-colors hover:text-yellow-400 hover:decoration-yellow-400" href={PAGES.primeraVez.href}>
              ¿Primera vez?
            </Link>
          </p>
        </Container>
      </section>

      {/* -------------------------------------------------------------- Agenda */}
      <Section
        actions={
          <ButtonLink arrow href={PAGES.eventos.href} size="sm" variant="secondary">
            Toda la agenda
          </ButtonLink>
        }
        description="Meetups, talleres y conferencias de toda la comunidad, en un solo lugar."
        id="agenda"
        title="Qué se viene"
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
          <Reveal>
            <div className={cardClassName(false, "overflow-hidden")}>
              {events.length === 0 ? (
                <p className="px-6 py-16 text-center text-sm text-zinc-500">
                  No hay eventos agendados todavía. Si organizás uno,{" "}
                  <Link className="text-zinc-200 underline" href={issueFormUrl("publicar-evento")}>
                    sumalo
                  </Link>
                  .
                </p>
              ) : (
                <>
                  {thisWeek.length > 0 ? (
                    <>
                      <p className="border-b border-white/[0.07] px-6 py-3 text-xs font-semibold tracking-[0.14em] text-yellow-400 uppercase">
                        Esta semana
                      </p>
                      <EventList events={thisWeek} />
                    </>
                  ) : null}
                  {later.length > 0 ? (
                    <>
                      <p className="border-y border-white/[0.07] bg-white/[0.02] px-6 py-3 text-xs font-semibold tracking-[0.14em] text-zinc-500 uppercase first:border-t-0">
                        Más adelante
                      </p>
                      <EventList events={later.slice(0, Math.max(3, 6 - thisWeek.length))} />
                    </>
                  ) : null}
                </>
              )}
            </div>
          </Reveal>
          <Reveal className="flex flex-col gap-4 lg:sticky lg:top-24" delay={0.1}>
            <Card>
              <CalendarSubscribe />
            </Card>
            <div className="rounded-2xl border border-dashed border-white/15 p-6 sm:p-7">
              <h3 className="font-title text-[17px] font-semibold text-white">¿Organizás algo?</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Si tu grupo publica en Meetup.com aparece solo. Si no, mandanos los datos y lo sumamos.
              </p>
              <ButtonLink
                arrow
                className="mt-5"
                href={issueFormUrl("publicar-evento")}
                size="sm"
                utm="home-publicar"
                variant="secondary"
              >
                Publicá tu evento
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ---------------------------------------------------------- Comunidades */}
      <Section
        actions={
          <ButtonLink arrow href={PAGES.comunidades.href} size="sm" variant="secondary">
            Ver el directorio
          </ButtonLink>
        }
        description="Cada grupo organiza sus propias meetups. OWU los conecta con un Slack, una agenda y una conferencia."
        title={`${communities.length} grupos, un mismo Slack`}
      >
        <Cells className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {featured.slice(0, 11).map((community) => {
            const next = nextByCommunity.get(community.slug);
            const when = next ? dateParts(next.start) : null;

            return (
              <Link
                key={community.slug}
                className={cardClassName(true, "flex flex-col gap-5 p-5 sm:p-6")}
                href={`/comunidades#${community.slug}`}
              >
                <CommunityLogo logo={community.logo} name={community.name} />
                <div className="min-w-0">
                  <p className="truncate font-title text-[15px] font-semibold text-white">{community.name}</p>
                  <p className="mt-1 truncate text-[13px] text-zinc-500">
                    {when ? (
                      <span className="font-medium text-yellow-400">
                        Próx. {when.weekday} {when.day} {when.month}
                      </span>
                    ) : (
                      community.description.split(/[.:]/)[0]
                    )}
                  </p>
                </div>
              </Link>
            );
          })}
          <Link
            className="group flex flex-col justify-between gap-5 rounded-2xl border border-dashed border-white/15 p-5 transition-[border-color,background-color] duration-300 hover:border-yellow-400/50 hover:bg-yellow-400/[0.04] sm:p-6"
            href={PAGES.comunidades.href}
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-white/[0.05] text-zinc-400 transition-colors duration-300 group-hover:bg-yellow-400 group-hover:text-zinc-950">
              <ArrowRight aria-hidden className="size-5" />
            </span>
            <span>
              <span className="block font-title text-[15px] font-semibold text-white">Ver las {communities.length}</span>
              <span className="mt-1 block text-[13px] text-zinc-500">y sumá la tuya</span>
            </span>
          </Link>
        </Cells>
      </Section>

      {/* ------------------------------------------------------- Cómo participar */}
      <Section
        description="No hay una forma correcta de ser parte. Estos son los caminos que más gente recorre."
        title="De la primera meetup a organizar la próxima"
      >
        <Cells className="sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body, href, cta }, index) => (
            <SmartLink
              key={title}
              className={cardClassName(true, "group flex flex-col gap-7 p-6 sm:p-7")}
              href={href}
              utm="home-pasos"
            >
              <div className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="font-title text-3xl leading-none font-extrabold text-white/[0.08]">0{index + 1}</span>
              </div>
              <div className="flex-1">
                <h3 className={headingClassName.h3}>{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-200 transition-colors group-hover:text-yellow-400">
                {cta}
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </SmartLink>
          ))}
        </Cells>
      </Section>

      {/* ---------------------------------------------------------------- Charlas */}
      {pastTalks.length > 0 ? (
        <Section
          actions={
            <ButtonLink arrow href={PAGES.charlas.href} size="sm" variant="secondary">
              Todas las charlas
            </ButtonLink>
          }
          description="Lo que se habló en La Meetup y OWU CONF, con video cuando hay grabación."
          title="Para ver con un mate"
        >
          <Cells className="gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {pastTalks.slice(0, 3).map((talk) => (
              <TalkCard key={talk.slug} talk={talk} />
            ))}
          </Cells>
        </Section>
      ) : null}

      {/* -------------------------------------------------------------- Historia */}
      <Section title="Desde 2014, juntándonos">
        <div className="grid items-start gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal className="flex flex-col gap-12">
            {landing?.mainSectionContent ? (
              <div className="max-w-xl space-y-4 text-base leading-relaxed text-zinc-400 [&_strong]:font-semibold [&_strong]:text-white">
                <RichText content={landing.mainSectionContent as unknown as string} />
              </div>
            ) : null}
            <StatStrip
              className="gap-y-8 sm:grid-cols-2"
              stats={stats.map(({ title, subtitle, count }) => ({
                value: `${title === "Años" ? "" : "+"}${formatCount(count ?? 0)}`,
                label: `${title} ${subtitle}`,
              }))}
            />
          </Reveal>
          <Reveal className="flex flex-col gap-14" delay={0.1}>
            <Polaroids className="pt-4" photos={PHOTOS} />
            <div className="mx-auto w-full max-w-md">
              <Timeline
                items={[
                  {
                    when: "2014",
                    title: "Nace el Slack de OWU",
                    body: "Para organizar la JSConfUY. Se quedó para todo lo demás.",
                  },
                  { when: "Nov 2023", title: "La Meetup I", href: "/2023/la-meetup" },
                  { when: "Oct 2024", title: "La Meetup II", href: "/2024/la-meetup" },
                  { when: "Nov 2025", title: "La Meetup III", href: "/la-meetup" },
                  { when: "Nov 2026", title: "OWU CONF 2026", href: CONF_URL, now: confUpcoming },
                ]}
              />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* -------------------------------------------------------------- Recursos */}
      <Section title="Lo que la comunidad comparte">
        <Cells className="md:grid-cols-3">
          {RESOURCES.map(({ icon: Icon, href, label, description, tag }) => (
            <Link key={href} className={cardClassName(true, "group flex flex-col gap-8 p-6 sm:p-7")} href={href}>
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-white/[0.05] text-zinc-300 transition-colors duration-300 group-hover:bg-yellow-400/10 group-hover:text-yellow-400">
                  <Icon aria-hidden className="size-5" />
                </span>
                <Badge>{tag}</Badge>
              </div>
              <div>
                <h3 className={cn(headingClassName.h3, "flex items-center gap-2")}>
                  {label}
                  <ArrowRight
                    aria-hidden
                    className="size-4 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-zinc-200"
                  />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
              </div>
            </Link>
          ))}
        </Cells>
      </Section>

      {/* -------------------------------------------------------------- Empresas */}
      <Section>
        <Reveal>
          <div className={cardClassName(false, "overflow-hidden p-8 sm:p-12")}>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(250,204,21,0.10),transparent_60%)]"
            />
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <Eyebrow>Para empresas</Eyebrow>
                <h2 className={cn(headingClassName.h2, "mt-4")}>Apoyá a la comunidad que te ayudó a crecer</h2>
                <TitleBar className="mt-5" />
                <ul className="mt-6 grid gap-3 text-[15px] text-zinc-300 sm:grid-cols-3 sm:gap-6">
                  {["Alojá una meetup", "Patrociná OWU CONF", "Publicá búsquedas"].map((item) => (
                    <li key={item} className="flex items-center gap-2.5">
                      <Building2 aria-hidden className="size-4 shrink-0 text-yellow-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <ButtonLink arrow href={PAGES.empresas.href} size="lg">
                Ver cómo
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* --------------------------------------------------------------- Cierre */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgba(250,204,21,0.10),transparent_70%)]"
        />
        <Container className="relative">
          <Reveal className="flex flex-col items-center text-center">
            <h2 className={cn(headingClassName.display, "max-w-3xl text-4xl sm:text-6xl lg:text-7xl")}>
              La comunidad es lo que hacemos entre todos.
            </h2>
            <TitleBar className="mt-7" />
            <p className="mt-6 max-w-lg text-lg text-zinc-400">Entrá, saludá en #general y contanos en qué andás.</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <ButtonLink arrow href={SOCIAL_LINKS.slack} size="lg" utm="cierre">
                Sumate al Slack
              </ButtonLink>
              <ButtonLink href={PAGES.primeraVez.href} size="lg" variant="secondary">
                Es mi primera vez
              </ButtonLink>
            </div>
          </Reveal>
        </Container>
      </section>

      <Footer />
      <script dangerouslySetInnerHTML={{ __html: serializeJsonLd(SITE_JSON_LD) }} type="application/ld+json" />
    </>
  );
}
