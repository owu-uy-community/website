import { ArrowUpRight } from "lucide-react";
import { FaGithub, FaInstagram, FaLinkedin, FaSlack, FaTelegram } from "react-icons/fa6";

import { CONF_DATES, SOCIAL_LINKS } from "app/lib/constants";
import { dateParts } from "lib/community/time";
import { SITE_URL } from "lib/community/site";

import { confUtm } from "../utm";

import Reveal from "./Reveal";

const SOCIALS = [
  { href: SOCIAL_LINKS.slack, label: "Slack", Icon: FaSlack },
  { href: "https://github.com/owu-uy-community", label: "GitHub", Icon: FaGithub },
  { href: SOCIAL_LINKS.linkedin, label: "LinkedIn", Icon: FaLinkedin },
  { href: SOCIAL_LINKS.instagram, label: "Instagram", Icon: FaInstagram },
  { href: SOCIAL_LINKS.telegram, label: "Telegram", Icon: FaTelegram },
];

/*
 * Same shape as the owu.uy footer: brand and socials on the left, link columns on the
 * right, a thin bottom bar with the credit. Anchors go through /conf so they work from
 * every conf page (on conf.owu.uy, /conf redirects to the root and keeps the hash).
 * Links to owu.uy share the analytics property, so they carry no UTM tags.
 */
const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "La conferencia",
    links: [
      { label: "Sobre OWU CONF", href: "/conf#sobre-owu" },
      { label: "Programa", href: "/conf#programa" },
      { label: "Speakers", href: "/conf#speakers" },
      { label: "Sponsors", href: "/conf#sponsors" },
      { label: "Equipo", href: "/conf#equipo" },
    ],
  },
  {
    title: "Participá",
    links: [
      { label: "Entradas", href: "/conf#entradas" },
      { label: "Tu credencial", href: "/conf/credencial" },
      { label: "Call for proposals", href: "/conf/call-for-proposals" },
      { label: "Sumá tu empresa", href: "/conf/sponsors" },
    ],
  },
  {
    title: "Comunidad",
    links: [
      { label: "owu.uy", href: SITE_URL, external: true },
      { label: "Agenda de meetups", href: `${SITE_URL}/eventos`, external: true },
      { label: "Código de conducta", href: `${SITE_URL}/codigo-de-conducta`, external: true },
      { label: "Sumate al Slack", href: confUtm(SOCIAL_LINKS.slack, "footer-social"), external: true },
    ],
  },
];

const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]";

export default function Footer() {
  const when = dateParts(CONF_DATES.event);

  return (
    <footer className="mt-12 w-full border-t border-white/[0.08] sm:mt-16">
      <Reveal amount={0.15} className="mx-auto w-full max-w-[1440px] px-8 pt-14 pb-8 sm:pt-16" y={20}>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <div className="flex max-w-sm flex-col gap-5">
            <a aria-label="OWU CONF, inicio" className={`w-fit ${focusRing}`} href="/conf">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="OWU CONF" className="h-8 w-auto" src="/images/conf/logo.png" />
            </a>
            <p className="text-sm leading-relaxed text-[#FBF5E7]/70">
              La conferencia de la comunidad tech de Uruguay. Construida por la comunidad, para la comunidad.
            </p>
            <p className="font-display text-xs leading-none font-bold tracking-[0.08em] text-[#F5BB03] uppercase">
              {when.weekday} {when.day} {when.month} · Sinergia Faro, Montevideo
            </p>
            <ul className="-ml-2 flex items-center gap-1">
              {SOCIALS.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a
                    aria-label={label}
                    className={`flex size-9 items-center justify-center text-[#FBF5E7]/70 transition-colors hover:text-[#F5BB03] ${focusRing}`}
                    href={confUtm(href, "footer-social")}
                    rel="noopener"
                    target="_blank"
                  >
                    <Icon aria-hidden size={18} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="Pie de página" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
            {COLUMNS.map(({ title, links }) => (
              <div key={title}>
                <p className="font-display text-xs leading-none font-bold tracking-[0.12em] text-[#FBF5E7]/45 uppercase">
                  {title}
                </p>
                <ul className="mt-5 flex flex-col gap-3">
                  {links.map(({ label, href, external }) => (
                    <li key={label}>
                      <a
                        className={`group inline-flex items-center gap-1 text-sm text-[#FBF5E7]/75 transition-colors hover:text-[#F5BB03] ${focusRing}`}
                        href={href}
                        rel={external ? "noopener" : undefined}
                        target={external ? "_blank" : undefined}
                      >
                        {label}
                        {external ? (
                          <ArrowUpRight
                            aria-hidden
                            className="size-3.5 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          />
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/[0.08] pt-6 text-[13px] text-[#FBF5E7]/50 sm:flex-row sm:items-center sm:justify-between">
          <span>© {CONF_DATES.event.slice(0, 4)} OWU CONF · Montevideo, Uruguay</span>
          {/* Credit to the organizer */}
          <a
            aria-label="Organizado por OWU, la comunidad tech de Uruguay"
            className={`group inline-flex w-fit items-center gap-2 ${focusRing}`}
            href={SITE_URL}
          >
            <span className="transition-colors group-hover:text-[#FBF5E7]">Organizado por</span>
            {/* The file has transparent margins; the negative margin keeps the bar thin */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="-my-2 h-8 w-auto opacity-70 transition-opacity group-hover:opacity-100"
              src="/images/logos/owu.webp"
            />
          </a>
        </div>
      </Reveal>
    </footer>
  );
}
