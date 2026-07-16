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
 * OWU CONF 2026 team, alphabetical by first name. Background-removed portraits
 * live in public/images/conf/staff/ (identities validated against the designer mockup).
 */
const TEAM_2026: TeamMember[] = [
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

const SHAPE_VARIANTS = ["blue", "yellow", "cream"] as const;

/* Sizes are % of the tile (not fixed px) so the shapes scale with the cell on narrow grids */
function TileShape({ variant }: { variant: (typeof SHAPE_VARIANTS)[number] }) {
  if (variant === "blue") {
    return (
      <svg aria-hidden="true" className="absolute -left-[2%] top-[22%] w-[86%]" fill="none" viewBox="0 0 190 96">
        <polygon fill="#0162C8" points="0,0 190,0 95,96" />
      </svg>
    );
  }

  if (variant === "yellow") {
    return (
      <svg aria-hidden="true" className="absolute -right-[2%] top-[13%] h-[80%]" fill="none" viewBox="0 0 100 200">
        <polygon fill="#F5BB03" points="100,0 100,200 0,100" />
      </svg>
    );
  }

  return <div aria-hidden="true" className="absolute -left-[2%] -top-[2%] h-[84%] w-[40%] bg-[#FBF5E7]" />;
}

export default function Team() {
  return (
    <section className="mx-auto mt-16 w-full max-w-[1440px] scroll-mt-24 px-8 sm:mt-[96px]" id="equipo">
      <SectionHeader eyebrow="¿QUIÉNES ESTÁN DETRÁS?" title="EQUIPO" />

      <Reveal delay={0.12} y={22}>
        <p className="mt-6 max-w-[640px] text-pretty text-lg leading-relaxed text-[#FBF5E7]/90">
          El equipo de voluntarios de la comunidad que organiza La Meetup desde 2023.
        </p>
      </Reveal>

      <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-14 sm:grid-cols-3 lg:grid-cols-4">
        {TEAM_2026.map(({ firstname, lastname, picture, jobTitle, linkedin }, i) => {
          const fullName = `${firstname} ${lastname}`;
          const variant = SHAPE_VARIANTS[i % SHAPE_VARIANTS.length];

          const tile = (
            <>
              <div className="relative mx-auto aspect-[22/25] w-full max-w-[220px]">
                <TileShape variant={variant} />
                <img
                  alt={`Fotografía de ${fullName}`}
                  className="absolute inset-x-0 bottom-0 mx-auto h-[92%] w-[91%] object-contain object-bottom transition-transform duration-300 group-hover:scale-[1.03]"
                  loading="lazy"
                  src={picture}
                />
              </div>
              <p className="mt-5 text-center font-display text-base font-bold uppercase leading-none text-[#F5BB03]">
                {fullName}
              </p>
              <p className="mt-2 text-center text-sm leading-5 text-[#FBF5E7]/85">{jobTitle}</p>
            </>
          );

          return (
            <li key={fullName}>
              <Reveal amount={0.3} delay={(i % 4) * 0.09} scale={0.93} y={34}>
                {linkedin ? (
                  <a
                    aria-label={`Perfil de LinkedIn de ${fullName}`}
                    className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
                    href={linkedin}
                    rel="noopener"
                    target="_blank"
                  >
                    {tile}
                  </a>
                ) : (
                  <div className="group">{tile}</div>
                )}
              </Reveal>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
