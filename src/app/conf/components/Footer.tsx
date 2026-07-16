import { FaGithub, FaInstagram, FaLinkedin, FaSlack } from "react-icons/fa6";

import { SOCIAL_LINKS } from "app/lib/constants";
import { addUtmParams } from "app/lib/utils";

import Reveal from "./Reveal";

const SOCIALS = [
  { href: SOCIAL_LINKS.slack, label: "Slack", Icon: FaSlack },
  { href: "https://github.com/owu-uy-community", label: "GitHub", Icon: FaGithub },
  { href: SOCIAL_LINKS.linkedin, label: "LinkedIn", Icon: FaLinkedin },
  { href: SOCIAL_LINKS.instagram, label: "Instagram", Icon: FaInstagram },
];

export default function Footer() {
  return (
    <footer className="mt-12 w-full border-t border-white/5 sm:mt-[64px]">
      <Reveal amount={0.5} className="mx-auto flex min-h-[140px] w-full max-w-[1440px] flex-col items-center justify-between gap-6 px-8 py-8 min-[1440px]:flex-row min-[1440px]:gap-0 min-[1440px]:py-0" y={24}>
        <img alt="OWU CONF" className="h-11 w-auto" src="/images/conf/logo.png" />

        <p className="text-center text-sm leading-6 text-[#FBF5E7] min-[1440px]:text-base">
          Construido por la comunidad
          <br />
          para la comunidad.
        </p>

        <div className="flex items-center gap-6">
          {SOCIALS.map(({ href, label, Icon }) => (
            <a
              key={label}
              aria-label={label}
              className="text-[#FBF5E7] transition-colors hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
              href={addUtmParams(href)}
              rel="noopener"
              target="_blank"
            >
              <Icon size={22} />
            </a>
          ))}
        </div>
      </Reveal>
    </footer>
  );
}
