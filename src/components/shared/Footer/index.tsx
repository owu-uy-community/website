import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { FaGithub, FaInstagram, FaLinkedin, FaSlack, FaTelegram, FaYoutube } from "react-icons/fa6";

import { Container, Eyebrow, SmartLink } from "components/community/ui";
import { FOOTER_COLUMNS, REPO_URL, SOCIALS } from "lib/community/site";

const ICONS = {
  slack: FaSlack,
  github: FaGithub,
  youtube: FaYoutube,
  linkedin: FaLinkedin,
  instagram: FaInstagram,
  telegram: FaTelegram,
};

export default function Footer() {
  return (
    <footer className="relative w-full overflow-hidden border-t border-line">
      <Container className="relative py-14 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div className="flex max-w-sm flex-col gap-5">
            <Link aria-label="OWU Uruguay, inicio" className="w-fit" href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="OWU Uruguay" className="h-8 w-auto" height={32} src="/images/logos/owu.webp" width={75} />
            </Link>
            <p className="text-sm leading-relaxed text-zinc-400">
              La comunidad tech de Uruguay desde 2014. Un Slack, decenas de grupos y una conferencia, hechos por gente que
              se da una mano.
            </p>
            <ul className="flex flex-wrap gap-1">
              {SOCIALS.map(({ key, label, href }) => {
                const Icon = ICONS[key];

                return (
                  <li key={key}>
                    <SmartLink
                      aria-label={label}
                      className="inline-flex size-9 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
                      href={href}
                      utm="footer"
                    >
                      <Icon aria-hidden className="size-[17px]" />
                    </SmartLink>
                  </li>
                );
              })}
            </ul>
          </div>

          <nav aria-label="Pie de página" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {FOOTER_COLUMNS.map(({ title, links }) => (
              <div key={title}>
                <Eyebrow>{title}</Eyebrow>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {links.map(({ href, label, external }) => (
                    <li key={href}>
                      <SmartLink
                        className="group inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-50"
                        href={href}
                        utm="footer"
                      >
                        {label}
                        {external ? (
                          <ArrowUpRight
                            aria-hidden
                            className="size-3 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          />
                        ) : null}
                      </SmartLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-line pt-6 font-terminal text-[11px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} OWU Uruguay · Hecho por la comunidad, con código abierto</span>
          <a className="inline-flex items-center gap-1 hover:text-zinc-300" href={REPO_URL} rel="noopener" target="_blank">
            ¿Ves algo para mejorar? Mandá un PR
            <ArrowUpRight aria-hidden className="size-3" />
          </a>
        </div>
      </Container>
      <p
        aria-hidden
        className="pointer-events-none -mb-[0.22em] text-center text-[22vw] leading-none font-semibold tracking-[-0.06em] text-white/[0.025] select-none"
      >
        owu.uy
      </p>
    </footer>
  );
}
