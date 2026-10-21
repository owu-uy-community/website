import { ArrowRight, BookOpen, Building2, CalendarDays, MessagesSquare, Mic, Newspaper, PiggyBank, Users } from "lucide-react";
import Link from "next/link";

import { CONF_DATES, SOCIAL_LINKS } from "app/lib/constants";
import CalendarSubscribe from "components/community/CalendarSubscribe";
import { EventList, splitThisWeek } from "components/community/events";
import HeroOrbit from "components/community/home/HeroOrbit";
import Polaroids from "components/community/home/Polaroids";
import RotatingWord from "components/community/home/RotatingWord";
import TalkCard from "components/community/TalkCard";
import Timeline from "components/community/Timeline";
import {
  AnnouncementPill,
  ButtonLink,
  Cell,
  Cells,
  CommunityLogo,
  Container,
  delay,
  Eyebrow,
  Section,
  StatStrip,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { RichText } from "components/shared/RichText";
import { getCommunities, getLanding, getTalks } from "lib/community/content";
import { getUpcomingEvents, nextEventByCommunity } from "lib/community/events";
import { CONF_URL, issueFormUrl, PAGES } from "lib/community/site";
import { dateParts } from "lib/community/time";

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
  { icon: BookOpen, href: "/blog?tag=guias", label: "Guías", description: "Empezar en tech en Uruguay, trabajar para afuera y más", tag: "Blog" },
];

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
    (a, b) => Number(nextByCommunity.has(b.slug)) - Number(nextByCommunity.has(a.slug)) || Number(!!b.logo) - Number(!!a.logo)
  );
  const orbit = communities.filter((community) => community.logo).map(({ slug, name, logo }) => ({ slug, name, logo: logo! }));

  const confUpcoming = Date.now() < Date.parse(CONF_DATES.event) + 8 * 3_600_000;
  const conf = dateParts(CONF_DATES.event);

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="owu-furnace pointer-events-none absolute inset-0 -z-10" />
        <div aria-hidden className="owu-grid-fade pointer-events-none absolute inset-0 -z-10" />
        <HeroOrbit tiles={orbit} />
        <Container className="relative flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center py-20 text-center sm:py-24">
          <div className="owu-rise" style={delay(0)}>
            {confUpcoming ? (
              <AnnouncementPill href={CONF_URL} utm="hero-pill">
                OWU CONF 2026 · {conf.weekday} {conf.day} {conf.month} · Sinergia Faro
              </AnnouncementPill>
            ) : events[0] ? (
              <AnnouncementPill href={PAGES.eventos.href}>Próximo: {events[0].title}</AnnouncementPill>
            ) : null}
          </div>

          <h1 className="mt-8 max-w-4xl text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.045em] text-balance text-zinc-50 sm:text-6xl md:text-7xl lg:text-[5.25rem]">
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
            className="owu-rise mt-6 max-w-xl text-base leading-relaxed text-pretty text-zinc-400 sm:text-lg"
            style={delay(300)}
          >
            {landing?.description ??
              "Un espacio donde personas apasionadas por la tecnología se reúnen, comparten y convierten sus ideas en realidad."}
          </p>

          <div className="owu-rise mt-9 flex flex-wrap items-center justify-center gap-3" style={delay(400)}>
            <ButtonLink arrow href={SOCIAL_LINKS.slack} size="lg" utm="hero">
              Sumate al Slack
            </ButtonLink>
            <ButtonLink href="#agenda" size="lg" variant="secondary">
              Ver la agenda
            </ButtonLink>
          </div>

          <p
            className="owu-rise mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-terminal text-[11px] tracking-[0.08em] text-zinc-500 uppercase"
            style={delay(520)}
          >
            {people ? <span>{formatCount(people)}+ personas</span> : null}
            <span aria-hidden className="text-zinc-700">
              /
            </span>
            <span>{communities.length} comunidades</span>
            <span aria-hidden className="text-zinc-700">
              /
            </span>
            <span>{events.length} eventos en agenda</span>
            <span aria-hidden className="text-zinc-700">
              /
            </span>
            <Link className="text-zinc-400 underline-offset-4 hover:text-yellow-400 hover:underline" href={PAGES.primeraVez.href}>
              ¿Primera vez?
            </Link>
          </p>
        </Container>
        <div aria-hidden className="owu-hairline-accent absolute inset-x-0 bottom-0 opacity-50" />
      </section>

      {/* -------------------------------------------------------------- Agenda */}
      <Section
        bordered={false}
        actions={
          <ButtonLink arrow href={PAGES.eventos.href} size="sm" variant="secondary">
            Toda la agenda
          </ButtonLink>
        }
        description="Meetups, talleres y conferencias de toda la comunidad, en un solo lugar."
        eyebrow="Agenda"
        id="agenda"
        title="Qué se viene"
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="overflow-hidden rounded-xl border border-line bg-ink-elev/60">
            {events.length === 0 ? (
              <p className="px-6 py-16 text-center text-sm text-zinc-500">
                No hay eventos agendados todavía. Si organizás uno, <Link className="text-zinc-200 underline" href={issueFormUrl("publicar-evento")}>sumalo</Link>.
              </p>
            ) : (
              <>
                {thisWeek.length > 0 ? (
                  <>
                    <p className="border-b border-line bg-white/[0.015] px-6 py-2.5 font-terminal text-[10.5px] tracking-[0.12em] text-yellow-400 uppercase">
                      Esta semana
                    </p>
                    <EventList events={thisWeek} />
                  </>
                ) : null}
                {later.length > 0 ? (
                  <>
                    <p className="border-y border-line bg-white/[0.015] px-6 py-2.5 font-terminal text-[10.5px] tracking-[0.12em] text-zinc-500 uppercase first:border-t-0">
                      Más adelante
                    </p>
                    <EventList events={later.slice(0, Math.max(3, 6 - thisWeek.length))} />
                  </>
                ) : null}
              </>
            )}
          </div>
          <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl border border-line bg-ink-elev/60 p-5">
              <CalendarSubscribe />
            </div>
            <div className="rounded-xl border border-dashed border-line-strong p-5">
              <Eyebrow>¿Organizás algo?</Eyebrow>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Si tu grupo publica en Meetup.com aparece solo. Si no, mandanos los datos y lo sumamos.
              </p>
              <ButtonLink arrow className="mt-4" href={issueFormUrl("publicar-evento")} size="sm" utm="home-publicar" variant="secondary">
                Publicá tu evento
              </ButtonLink>
            </div>
          </aside>
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
        eyebrow="Comunidades"
        title={`${communities.length} grupos, un mismo Slack`}
      >
        <Cells className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {featured.slice(0, 11).map((community) => {
            const next = nextByCommunity.get(community.slug);
            const when = next ? dateParts(next.start) : null;

            return (
              <Link
                key={community.slug}
                className="group relative flex flex-col gap-4 bg-ink p-5 transition-colors hover:bg-white/[0.03] sm:p-6"
                href={`/comunidades#${community.slug}`}
              >
                <CommunityLogo logo={community.logo} name={community.name} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-zinc-100">{community.name}</p>
                  <p className="mt-1 font-terminal text-[11px] text-zinc-500">
                    {when ? (
                      <span className="text-yellow-400">
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
            className="group flex flex-col justify-between gap-4 bg-ink p-5 transition-colors hover:bg-yellow-400/[0.06] sm:p-6"
            href={PAGES.comunidades.href}
          >
            <span className="flex size-12 items-center justify-center rounded-lg border border-dashed border-line-strong text-zinc-500 transition-colors group-hover:border-yellow-400/50 group-hover:text-yellow-400">
              <ArrowRight aria-hidden className="size-5" />
            </span>
            <span>
              <span className="block text-[15px] font-medium text-zinc-100">Ver las {communities.length}</span>
              <span className="mt-1 block font-terminal text-[11px] text-zinc-500">y sumá la tuya</span>
            </span>
          </Link>
        </Cells>
      </Section>

      {/* ------------------------------------------------------- Cómo participar */}
      <Section
        description="No hay una forma correcta de ser parte. Estos son los caminos que más gente recorre."
        eyebrow="Participá"
        title="De la primera meetup a organizar la próxima"
      >
        <Cells className="sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body, href, cta }, index) => (
            <Cell key={title} className="group flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <span className="font-terminal text-[11px] tracking-[0.12em] text-zinc-600">0{index + 1}</span>
                <Icon aria-hidden className="size-5 text-zinc-500 transition-colors group-hover:text-yellow-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
              <ButtonLink arrow className="self-start px-0 hover:translate-y-0 hover:bg-transparent hover:text-yellow-400" href={href} size="sm" utm="home-pasos" variant="ghost">
                {cta}
              </ButtonLink>
            </Cell>
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
          eyebrow="Charlas"
          title="Para ver con un mate"
        >
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {pastTalks.slice(0, 3).map((talk) => (
              <TalkCard key={talk.slug} talk={talk} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* -------------------------------------------------------------- Historia */}
      <Section eyebrow="Historia" title="Desde 2014, juntándonos">
        <div className="grid items-start gap-14 lg:grid-cols-2">
          <div className="flex flex-col gap-10">
            {landing?.mainSectionContent ? (
              <div className="max-w-xl space-y-4 text-[15px] leading-relaxed text-zinc-400 [&_strong]:font-medium [&_strong]:text-zinc-100">
                <RichText content={landing.mainSectionContent as unknown as string} />
              </div>
            ) : null}
            <StatStrip
              className="sm:grid-cols-2"
              stats={stats.map(({ title, subtitle, count }) => ({
                value: `${title === "Años" ? "" : "+"}${formatCount(count ?? 0)}`,
                label: `${title} ${subtitle}`,
              }))}
            />
          </div>
          <div className="flex flex-col gap-14">
            <Polaroids className="pt-4" photos={PHOTOS} />
            <div className="mx-auto w-full max-w-md">
              <Timeline
                items={[
                  { when: "2014", title: "Nace el Slack de OWU", body: "Para organizar la JSConfUY. Se quedó para todo lo demás." },
                  { when: "Nov 2023", title: "La Meetup I", href: "/2023/la-meetup" },
                  { when: "Oct 2024", title: "La Meetup II", href: "/2024/la-meetup" },
                  { when: "Nov 2025", title: "La Meetup III", href: "/la-meetup" },
                  { when: "Nov 2026", title: "OWU CONF 2026", href: CONF_URL, now: confUpcoming },
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* -------------------------------------------------------------- Recursos */}
      <Section eyebrow="Para leer" title="Lo que la comunidad comparte">
        <Cells className="md:grid-cols-3">
          {RESOURCES.map(({ icon: Icon, href, label, description, tag }) => (
            <Link key={href} className="group relative flex flex-col gap-6 bg-ink p-6 transition-colors hover:bg-white/[0.03] sm:p-8" href={href}>
              <div className="flex items-center justify-between">
                <Icon aria-hidden className="size-5 text-zinc-500 transition-colors group-hover:text-yellow-400" />
                <span className="font-terminal text-[10.5px] tracking-[0.12em] text-zinc-600 uppercase">{tag}</span>
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-zinc-50">
                  {label}
                  <ArrowRight aria-hidden className="size-4 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-zinc-200" />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
              </div>
            </Link>
          ))}
        </Cells>
      </Section>

      {/* -------------------------------------------------------------- Empresas */}
      <Section>
        <div className="relative overflow-hidden rounded-2xl border border-line bg-ink-elev/60 p-8 sm:p-12">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(250,204,21,0.08),transparent_60%)]" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <Eyebrow dot>Para empresas</Eyebrow>
              <h2 className="mt-4 text-3xl leading-[1.05] font-semibold tracking-[-0.03em] text-zinc-50 sm:text-4xl">
                Apoyá a la comunidad que te ayudó a crecer
              </h2>
              <ul className="mt-6 grid gap-2 text-[15px] text-zinc-400 sm:grid-cols-3 sm:gap-6">
                {["Alojá una meetup", "Patrociná OWU CONF", "Publicá búsquedas"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Building2 aria-hidden className="size-4 shrink-0 text-zinc-600" />
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
      </Section>

      {/* --------------------------------------------------------------- Cierre */}
      <section className="relative overflow-hidden border-t border-line py-24 sm:py-32">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgba(250,204,21,0.09),transparent_70%)]" />
        <Container className="relative flex flex-col items-center text-center">
          <h2 className="max-w-3xl text-4xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance text-zinc-50 sm:text-6xl">
            La comunidad es lo que hacemos entre todos.
          </h2>
          <p className="mt-5 max-w-lg text-zinc-400">Entrá, saludá en #general y contanos en qué andás.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink arrow href={SOCIAL_LINKS.slack} size="lg" utm="cierre">
              Sumate al Slack
            </ButtonLink>
            <ButtonLink href={PAGES.primeraVez.href} size="lg" variant="secondary">
              Es mi primera vez
            </ButtonLink>
          </div>
        </Container>
      </section>

      <Footer />
    </>
  );
}
