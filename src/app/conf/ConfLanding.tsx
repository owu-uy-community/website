"use client";

import { Icon } from "@iconify/react";

import { EXTERNAL_SERVICES, SOCIAL_LINKS } from "app/lib/constants";

import HeroTangram from "./HeroTangram";
import TangramPlayground from "./TangramPlayground";

const CREAM = "#FBF5E7";
const YELLOW = "#EBB403";
const BLUE = "#0162C8";

const CONTAINER = "mx-auto w-full max-w-[1248px] px-6 xl:px-0";

const NAV_LINKS = [
  { href: "#sobre-owu", label: "Sobre OWU" },
  { href: "#sponsors", label: "Sponsors" },
  { href: "#equipo", label: "Equipo" },
];

const SPONSOR_FORM = EXTERNAL_SERVICES.googleForms.sponsorsConf.replace("?embedded=true", "?usp=dialog");
const SPEAKER_FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLSc0phWkd_wmbg21EmQWRvjjASn0wvhQm3k0V5fJ8oCALD05vQ/viewform?usp=dialog";

const STATS = [
  { top: "Personas", value: "+250", bottom: "Asistieron" },
  { top: "Comunidades", value: "+10", bottom: "Reunidas" },
  { top: "Miembros", value: "+5.000", bottom: "Conectados" },
  { top: "Años", value: "+10", bottom: "Construyendo" },
];

type TeamShape =
  | "triangle-down-blue"
  | "triangle-yellow"
  | "notch-yellow"
  | "circle-cream-right"
  | "square-yellow"
  | "donut-blue"
  | "rect-cream"
  | "triangle-right-blue"
  | "circle-cream-center"
  | "quad-blue"
  | "rect-yellow";

// Ordenado alfabéticamente por nombre.
const TEAM: { name: string; image: string; shape: TeamShape }[] = [
  { name: "Agustín Tornielli", image: "agustin-tornielli", shape: "triangle-right-blue" },
  { name: "Francisco Bergeret", image: "francisco-bergeret", shape: "circle-cream-right" },
  { name: "Itay Brenner", image: "itay-brenner", shape: "rect-cream" },
  { name: "Javier García", image: "javier-garcia", shape: "rect-yellow" },
  { name: "Javier Valenzani", image: "javier-valenzani", shape: "triangle-yellow" },
  { name: "Juan Diana", image: "juan-diana", shape: "notch-yellow" },
  { name: "Kevin Exposito", image: "kevin-exposito", shape: "triangle-down-blue" },
  { name: "Laura Rodriguez", image: "laura-rodriguez", shape: "donut-blue" },
  { name: "Marcelo Dominguez", image: "marcelo-dominguez", shape: "square-yellow" },
  { name: "Mauricio Mena", image: "mauricio-mena", shape: "circle-cream-center" },
  { name: "Santiago Ferreira", image: "santiago-ferreira", shape: "quad-blue" },
];

function TeamShapeDecoration({ shape }: { shape: TeamShape }) {
  switch (shape) {
    case "triangle-down-blue":
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute left-[14%] top-[10%] h-[60%] w-[72%]">
          <polygon points="0,0 100,0 50,100" fill={BLUE} />
        </svg>
      );
    case "triangle-yellow":
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute left-[2%] top-[4%] h-[75%] w-[55%]">
          <polygon points="0,0 100,0 0,100" fill={YELLOW} />
        </svg>
      );
    case "notch-yellow":
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute left-[42%] top-[4%] h-[55%] w-[55%]">
          <polygon points="0,0 100,0 100,100 50,50 0,100" fill={YELLOW} />
        </svg>
      );
    case "circle-cream-right":
      return <span className="absolute left-[52%] top-[12%] aspect-square w-[60%] rounded-full" style={{ backgroundColor: CREAM }} />;
    case "square-yellow":
      return <span className="absolute left-[43%] top-[18%] h-[53%] w-[53%]" style={{ backgroundColor: YELLOW }} />;
    case "donut-blue":
      return (
        <svg viewBox="0 0 103 206" preserveAspectRatio="none" className="absolute left-[4%] top-[12%] h-[81%] w-[41%]">
          <path d="M0 0a103 103 0 0 1 0 206v-51a52 52 0 0 0 0-104Z" fill={BLUE} />
        </svg>
      );
    case "rect-cream":
      return <span className="absolute left-[59%] top-[12%] h-[70%] w-[33%]" style={{ backgroundColor: CREAM }} />;
    case "triangle-right-blue":
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute left-0 top-[2%] h-[83%] w-[66%]">
          <polygon points="0,0 100,50 0,100" fill={BLUE} />
        </svg>
      );
    case "circle-cream-center":
      return <span className="absolute left-[25%] top-[16%] aspect-square w-[75%] rounded-full" style={{ backgroundColor: CREAM }} />;
    case "quad-blue":
      return <img src="/images/conf/shapes/santiago-quad.svg" alt="" className="absolute left-0 top-[34%] h-[66%] w-[92%]" />;
    case "rect-yellow":
      return <span className="absolute left-0 top-[65%] h-[34%] w-[89%]" style={{ backgroundColor: YELLOW }} />;
  }
}

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-bold uppercase sm:text-xl" style={{ color: CREAM }}>
        {kicker}
      </p>
      <h2
        className="text-[clamp(2.5rem,5vw,4rem)] font-extrabold uppercase leading-none tracking-tight"
        style={{ color: CREAM }}
      >
        {title}
      </h2>
    </div>
  );
}

function PillButton({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex min-w-[120px] items-center justify-center rounded-full px-6 py-3 text-base font-bold uppercase text-black transition-transform hover:-translate-y-0.5 sm:text-xl";
  if (href) {
    const external = href.startsWith("http");
    return (
      <a
        href={href}
        className={className}
        style={{ backgroundColor: YELLOW }}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={{ backgroundColor: YELLOW }}>
      {children}
    </button>
  );
}

function TextLinkButton({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
  const className = "text-lg font-bold uppercase transition-opacity hover:opacity-80 sm:text-xl";
  if (href) {
    const external = href.startsWith("http");
    return (
      <a
        href={href}
        className={className}
        style={{ color: YELLOW }}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${className} text-left`} style={{ color: YELLOW }}>
      {children}
    </button>
  );
}

export default function ConfLanding() {
  return (
    <div className="bg-black font-display" style={{ color: CREAM }}>
      <header className={`${CONTAINER} relative z-20 flex h-[102px] items-center justify-between gap-6`}>
        <a href="#" aria-label="OWU CONF" className="shrink-0">
          <img src="/images/logos/conf.webp" alt="OWU CONF" className="h-10 w-auto sm:h-[54px]" />
        </a>

        <div className="flex items-center gap-2 md:gap-6">
          <nav className="hidden items-center gap-6 md:flex" aria-label="Principal">
            {NAV_LINKS.map(({ href, label }) => (
              <a
                key={label}
                href={href}
                className="px-2 text-lg font-bold uppercase transition-colors hover:text-[#EBB403] lg:text-xl"
                style={{ color: CREAM }}
              >
                {label}
              </a>
            ))}
          </nav>
          <PillButton href={SOCIAL_LINKS.slack}>Sumate</PillButton>
        </div>
      </header>

      <section className={`${CONTAINER} relative pb-24 pt-12 lg:min-h-[696px] lg:pb-0 lg:pt-20`}>
        <HeroTangram />

        <div className="relative z-10 flex max-w-[630px] flex-col items-start gap-8">
          <h1 className="text-[clamp(3rem,7vw,6rem)] font-extrabold uppercase leading-none tracking-tight">
            <span className="block" style={{ color: YELLOW }}>
              Ideas
            </span>
            <span className="block" style={{ color: CREAM }}>
              Tecnología
            </span>
            <span className="block" style={{ color: BLUE }}>
              Comunidad
            </span>
          </h1>

          <p className="max-w-xl font-sans text-lg leading-snug sm:text-xl">
            OWU CONF es una conferencia que reúne a personas apasionadas por la tecnología, sin importar el lenguaje o
            la herramienta que utilicen. Un espacio para compartir conocimiento, descubrir nuevas ideas y fortalecer
            una comunidad que crece a través de la colaboración.
          </p>

          <p className="text-xl font-bold uppercase leading-tight sm:text-2xl">
            07 de Noviembre 2026 - Montevideo
            <br />
            Montevideo - Sinergia Faro
          </p>

        </div>

        <img
          src="/images/conf/photos/hero-strip.png"
          alt="Comunidad OWU en La Meetup"
          className="mt-12 aspect-[2/1] w-full object-cover lg:hidden"
        />
      </section>

      <section id="sobre-owu" className={`${CONTAINER} flex flex-col gap-8 py-16`}>
        <SectionHeading kicker="Sobre OWU" title="OWU CONF = LA MEETUP" />

        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-8">
          <div className="flex max-w-[598px] shrink-0 flex-col gap-8">
            <div className="flex flex-col gap-8 font-sans text-lg leading-snug sm:text-xl">
              <p>
                Durante más de diez años, OWU ha reunido a comunidades tecnológicas de todo Uruguay para crear un
                espacio donde aprender, intercambiar experiencias y generar conexiones.
              </p>
              <p>
                Hoy esa comunidad evoluciona. La Meetup pasa a llamarse OWU CONF: una nueva identidad para el mismo
                espíritu que nos acompaña desde el primer día.
              </p>
            </div>
            <TextLinkButton href="/">Conocé más</TextLinkButton>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-8">
            {["about-1", "about-2", "about-3c", "about-4c"].map((photo) => (
              <img
                key={photo}
                src={`/images/conf/photos/${photo}.png`}
                alt=""
                className="aspect-square w-full object-cover"
              />
            ))}
          </div>
        </div>
      </section>

      <section style={{ backgroundColor: CREAM }}>
        <div className={`${CONTAINER} grid grid-cols-2 gap-8 py-8 text-black lg:grid-cols-4`}>
          {STATS.map(({ top, value, bottom }) => (
            <div key={top} className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-lg font-bold uppercase sm:text-xl">{top}</p>
              <p className="text-5xl font-extrabold leading-none sm:text-6xl">{value}</p>
              <p className="text-lg font-bold uppercase sm:text-xl">{bottom}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${CONTAINER} flex flex-col gap-8 py-16`}>
        <SectionHeading kicker="Equipo" title="Speakers" />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-stretch">
          <img
            src="/images/conf/photos/speakers-b.png"
            alt="Audiencia en una edición de La Meetup"
            className="h-64 w-full object-cover lg:h-auto lg:w-[608px]"
          />
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-8 font-sans text-lg leading-snug sm:text-xl">
              <p>
                Cada edición reúne charlas sobre desarrollo, infraestructura, inteligencia artificial, arquitectura de
                software, liderazgo, seguridad, producto y mucho más.
              </p>
              <p>
                Buscamos una agenda diversa, con distintos enfoques y tecnologías, porque creemos que las mejores
                conversaciones nacen cuando se cruzan perspectivas diferentes.
              </p>
            </div>
            <TextLinkButton href={SPEAKER_FORM}>Postulá tu idea</TextLinkButton>
          </div>
        </div>
      </section>

      <section id="sponsors" className={`${CONTAINER} flex flex-col gap-8 py-16`}>
        <SectionHeading kicker="Quiénes hacen posible OWU CONF?" title="Sponsors" />

        <div className="flex flex-col gap-6">
          <p
            className="text-[clamp(2rem,4vw,4rem)] font-extrabold uppercase leading-none tracking-tight"
            style={{ color: CREAM }}
          >
            Seguimos en
            <br />
            la búsqueda
          </p>
          <p className="max-w-[598px] font-sans text-lg leading-snug sm:text-xl">
            ¿Querés sponsorear OWU CONF? Completá el formulario y nos ponemos en contacto.
          </p>
          <TextLinkButton href={SPONSOR_FORM}>Sumate acá!</TextLinkButton>
        </div>
      </section>

      <section id="equipo" className={`${CONTAINER} flex flex-col gap-8 py-16`}>
        <SectionHeading kicker="Quienes están detrás?" title="Equipo" />

        <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-4">
          {TEAM.map(({ name, image, shape }) => (
            <div key={name} className="flex flex-col items-center gap-4 text-center">
              <div className="relative aspect-square w-full max-w-[255px]">
                <TeamShapeDecoration shape={shape} />
                <img
                  src={`/images/conf/team/${image}.png`}
                  alt={name}
                  className="absolute inset-0 z-10 size-full object-fill"
                />
              </div>
              <p className="text-lg font-bold uppercase sm:text-xl" style={{ color: YELLOW }}>
                {name}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className={`${CONTAINER} flex flex-col items-center justify-between gap-10 py-16 lg:flex-row`}>
        <img src="/images/logos/conf.webp" alt="OWU CONF" className="h-[54px] w-auto" />
        <p className="text-center font-sans text-lg text-white sm:text-xl">
          Construido por la comunidad
          <br />
          para la comunidad.
        </p>
        <div className="flex items-center gap-5">
          <a href={SOCIAL_LINKS.slack} target="_blank" rel="noopener noreferrer" aria-label="Slack de OWU">
            <Icon icon="mdi:slack" className="size-7 text-white transition-colors hover:text-[#EBB403]" />
          </a>
          <a href="https://github.com/owu-uy-community" target="_blank" rel="noopener noreferrer" aria-label="GitHub de OWU">
            <Icon icon="mdi:github" className="size-7 text-white transition-colors hover:text-[#EBB403]" />
          </a>
          <a href={SOCIAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn de OWU">
            <Icon icon="mdi:linkedin" className="size-7 text-white transition-colors hover:text-[#EBB403]" />
          </a>
          <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram de OWU">
            <Icon icon="mdi:instagram" className="size-7 text-white transition-colors hover:text-[#EBB403]" />
          </a>
        </div>
      </footer>

      <TangramPlayground />
    </div>
  );
}
