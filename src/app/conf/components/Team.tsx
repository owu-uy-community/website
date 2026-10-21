import { confUtm, type ConfLinkPlacement } from "../utm";

import Reveal from "./Reveal";
import SectionHeader from "./SectionHeader";

type TeamMember = {
  firstname: string;
  lastname: string;
  picture: string;
  jobTitle: string;
  linkedin?: string;
};

/*
 * OWU CONF 2026 team, alphabetical by first name. Portraits live in
 * public/images/conf/staff/ with the brand shape already composited in, so the
 * tile renders the image alone.
 */
export const TEAM_2026: TeamMember[] = [
  {
    firstname: "Agustín",
    lastname: "Tornielli",
    picture: "/images/conf/staff/agustin-tornielli.webp",
    jobTitle: "Full-Stack Web Developer",
    linkedin: "https://www.linkedin.com/in/agustin-tornielli/",
  },
  {
    firstname: "Francisco",
    lastname: "Bergeret",
    picture: "/images/conf/staff/francisco-bergeret.webp",
    jobTitle: "Technical Lead, Perficient",
    linkedin: "https://www.linkedin.com/in/franciscobergeret/",
  },
  {
    firstname: "Itay",
    lastname: "Brenner",
    picture: "/images/conf/staff/itay-brenner.webp",
    jobTitle: "Software Engineer",
    linkedin: "https://www.linkedin.com/in/itaybrenner/",
  },
  {
    firstname: "Javier",
    lastname: "García",
    picture: "/images/conf/staff/javier-garcia.webp",
    jobTitle: "Product Designer",
  },
  {
    firstname: "Javier",
    lastname: "Valenzani",
    picture: "/images/conf/staff/javier-valenzani.webp",
    jobTitle: "Director, Holberton",
    linkedin: "https://www.linkedin.com/in/jvalenzani/",
  },
  {
    firstname: "Juan",
    lastname: "Diana",
    picture: "/images/conf/staff/juan-diana.webp",
    jobTitle: "Software Developer",
    linkedin: "https://www.linkedin.com/in/juandiana/",
  },
  {
    firstname: "Kevin",
    lastname: "Exposito",
    picture: "/images/conf/staff/kevin-exposito.webp",
    jobTitle: "Engineer, Mimiquate",
    linkedin: "https://www.linkedin.com/in/kevinexposito/",
  },
  {
    firstname: "Laura",
    lastname: "Rodríguez",
    picture: "/images/conf/staff/laura-rodriguez.webp",
    jobTitle: "Software Developer, Etraveli",
    linkedin: "https://www.linkedin.com/in/laura-rodriguez-canova/",
  },
  {
    firstname: "Marcelo",
    lastname: "Dominguez",
    picture: "/images/conf/staff/marcelo-dominguez.webp",
    jobTitle: "Engineer, Mimiquate",
    linkedin: "https://www.linkedin.com/in/marpo60/",
  },
  {
    firstname: "Mauricio",
    lastname: "Mena",
    picture: "/images/conf/staff/mauricio-mena.webp",
    jobTitle: "Software Developer",
    linkedin: "https://www.linkedin.com/in/mauricio-mena-7bb13271/",
  },
  {
    firstname: "Santiago",
    lastname: "Ferreira",
    picture: "/images/conf/staff/santiago-ferreira.webp",
    jobTitle: "Software Developer",
    linkedin: "https://www.linkedin.com/in/santiagoferreira/",
  },
];

type PersonCardProps = {
  name: string;
  picture: string;
  role: string;
  linkedin?: string;
  placement: ConfLinkPlacement;
};

/* Portrait, name and role; links to LinkedIn when there is one. Shared with Speakers. */
export function PersonCard({ name, picture, role, linkedin, placement }: PersonCardProps) {
  const tile = (
    <>
      <div className="relative mx-auto aspect-square w-full max-w-[240px]">
        <img
          alt={`Fotografía de ${name}`}
          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          src={picture}
        />
      </div>
      <p className="mt-5 text-center font-display text-base leading-none font-bold text-[#F5BB03] uppercase">{name}</p>
      <p className="mt-2 text-center text-sm leading-5 text-[#FBF5E7]/85">{role}</p>
    </>
  );

  return linkedin ? (
    <a
      aria-label={`Perfil de LinkedIn de ${name}`}
      className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
      href={confUtm(linkedin, placement)}
      rel="noopener"
      target="_blank"
    >
      {tile}
    </a>
  ) : (
    <div className="group">{tile}</div>
  );
}

export default function Team() {
  return (
    <section className="mx-auto mt-16 w-full max-w-[1440px] scroll-mt-24 px-8 sm:mt-[96px]" id="equipo">
      <SectionHeader eyebrow="¿QUIÉNES ESTÁN DETRÁS?" title="EQUIPO" />

      <Reveal delay={0.12} y={22}>
        <p className="mt-6 max-w-[640px] text-lg leading-relaxed text-pretty text-[#FBF5E7]/90">
          El equipo de voluntarios de la comunidad que organiza La Meetup desde 2023.
        </p>
      </Reveal>

      <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-14 sm:grid-cols-3 lg:grid-cols-4">
        {TEAM_2026.map(({ firstname, lastname, picture, jobTitle, linkedin }, i) => {
          const fullName = `${firstname} ${lastname}`;

          return (
            <li key={fullName}>
              <Reveal amount={0.3} delay={(i % 4) * 0.09} scale={0.93} y={34}>
                <PersonCard
                  linkedin={linkedin}
                  name={fullName}
                  picture={picture}
                  placement="team-linkedin"
                  role={jobTitle}
                />
              </Reveal>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
