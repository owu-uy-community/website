import Link from "next/link";
import { FaInstagram, FaLinkedin } from "react-icons/fa";

export default function Footer() {
  const LINKS = [
    {
      href: "https://slack.owu.uy/",
      label: "Sumate a la comunidad",
      external: true,
    },
    // Enable FAQS when the page is ready :)
    // {
    //   href: "/la-meetup/faqs",
    //   label: "Preguntas frecuentes",
    // },
    // {
    //   href: "/la-meetup/#codigo-conducta",
    //   label: "Código de conducta",
    // },
    {
      href: "/2023/la-meetup/",
      label: "La Meetup 2023",
    },
    {
      href: "/la-meetup",
      label: "La Meetup 2024",
    },
  ];

  return (
    <footer className="w-full border-t border-zinc-500 px-4 sm:px-6 lg:px-8 xl:px-0">
      <div className="flex flex-col justify-between py-8 text-center text-white lg:flex-row">
        <ul className="flex flex-col gap-4 pb-8 text-sm font-[550] sm:text-base md:pb-3 lg:flex-row lg:text-left">
          {LINKS.map(({ href, label, external }) => (
            <li key={href} className="hover:text-yellow-400">
              <Link
                key={href}
                href={href}
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
            className="font-light hover:text-yellow-400"
            key="instagram-link"
            href="https://www.instagram.com/owu__uy/"
            rel="noopener"
            target="_blank"
          >
            <FaInstagram size={20} />
          </Link>
          <Link
            className="font-light hover:text-yellow-400"
            key="linkedin"
            href="https://www.linkedin.com/company/owu-uruguay/"
            rel="noopener"
            target="_blank"
          >
            <FaLinkedin size={20} />
          </Link>
          <Link className="font-light hover:text-yellow-400" href="/">
            © OWU Uruguay
          </Link>
        </div>
      </div>
    </footer>
  );
}
