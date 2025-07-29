import Link from "next/link";
import { FaInstagram, FaLinkedin } from "react-icons/fa";

import { addUtmParams } from "app/lib/utils";
import { SOCIAL_LINKS, INTERNAL_ROUTES } from "app/lib/constants";

export default function Footer() {
  const LINKS = [
    {
      href: SOCIAL_LINKS.slack,
      label: "Sumate a la comunidad",
      external: true,
    },
    // Enable FAQS when the pages are ready :)
    // {
    //   href: "/la-meetup/faqs",
    //   label: "Preguntas frecuentes",
    // },
    // {
    //   href: "/la-meetup/#codigo-conducta",
    //   label: "Código de conducta",
    // },
    {
      href: INTERNAL_ROUTES.meetups.meetup2023,
      label: "La Meetup I",
    },
    {
      href: INTERNAL_ROUTES.meetups.meetup2024,
      label: "La Meetup II",
    },
    {
      href: INTERNAL_ROUTES.meetups.meetup2025,
      label: "La Meetup III",
    },
  ];

  return (
    <footer className="w-full border-t border-zinc-500 px-4 sm:px-6 lg:px-8 xl:px-0">
      <div className="flex flex-col justify-between py-8 text-center text-white lg:flex-row">
        <ul className="flex flex-col gap-4 pb-8 text-sm font-[550] sm:text-base md:pb-3 lg:flex-row lg:pb-0 lg:text-left">
          {LINKS.map(({ href, label, external }) => (
            <li key={href} className="hover:text-yellow-400">
              <Link
                key={href}
                href={external ? addUtmParams(href) : href}
                rel={external ? "noopener" : undefined}
                target={external ? "_blank" : undefined}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-center gap-4">
          <Link
            key="instagram-link"
            className="font-light hover:text-yellow-400"
            href={addUtmParams(SOCIAL_LINKS.instagram)}
            rel="noopener"
            target="_blank"
          >
            <FaInstagram size={20} />
          </Link>
          <Link
            key="linkedin"
            className="font-light hover:text-yellow-400"
            href={addUtmParams(SOCIAL_LINKS.linkedin)}
            rel="noopener"
            target="_blank"
          >
            <FaLinkedin size={20} />
          </Link>
          <Link className="font-light hover:text-yellow-400" href={addUtmParams("/")}>
            © OWU Uruguay
          </Link>
        </div>
      </div>
    </footer>
  );
}
