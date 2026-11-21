import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
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

// Read once, when the server loads the module (each deploy): a prerendered page can't read the clock
const YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="relative w-full overflow-hidden border-t border-white/[0.07]">
      <Container className="relative py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr] lg:gap-16">
          <div className="flex max-w-sm flex-col gap-6">
            <Link aria-label="OWU Uruguay, inicio" className="w-fit" href="/">
              <Image alt="OWU Uruguay" className="h-9 w-auto" height={36} src="/images/logos/owu.webp" width={85} />
            </Link>
            <p className="text-[15px] leading-relaxed text-zinc-400">
              La comunidad tech de Uruguay desde 2014. Un Slack, decenas de comunidades y una conferencia, hechos por
              gente que se da una mano.
            </p>
            <ul className="flex flex-wrap gap-1">
              {SOCIALS.map(({ key, label, href }) => {
                const Icon = ICONS[key];

                return (
                  <li key={key}>
                    <SmartLink
                      aria-label={label}
                      className="inline-flex size-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-yellow-400"
                      href={href}
                      utm="footer"
                    >
                      <Icon aria-hidden className="size-[18px]" />
                    </SmartLink>
                  </li>
                );
              })}
            </ul>
          </div>

          <nav aria-label="Pie de página" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {FOOTER_COLUMNS.map(({ title, links }) => (
              <div key={title}>
                <Eyebrow className="text-zinc-400">{title}</Eyebrow>
                <ul className="mt-5 flex flex-col gap-3">
                  {links.map(({ href, label, external }) => (
                    <li key={href}>
                      <SmartLink
                        className="group inline-flex items-center gap-1 text-[15px] text-zinc-400 transition-colors hover:text-white"
                        href={href}
                        utm="footer"
                      >
                        {label}
                        {external ? (
                          <ArrowUpRight
                            aria-hidden
                            className="size-3.5 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
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

        <div className="mt-16 flex flex-col gap-3 border-t border-white/[0.07] pt-6 text-[13px] text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
          <span>© {YEAR} OWU Uruguay · Hecho por la comunidad, con código abierto</span>
          <a
            className="inline-flex items-center gap-1 transition-colors hover:text-zinc-200"
            href={REPO_URL}
            rel="noopener"
            target="_blank"
          >
            ¿Ves algo para mejorar? Mandá un PR
            <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        </div>
      </Container>
      {/* A watermark, not text: drawn as generated content so contrast checks and readers skip it */}
      <div
        aria-hidden
        className="pointer-events-none -mb-[0.2em] text-center font-title text-[21vw] leading-none font-extrabold tracking-[-0.05em] text-white/[0.025] select-none before:content-['owu.uy']"
      />
    </footer>
  );
}
