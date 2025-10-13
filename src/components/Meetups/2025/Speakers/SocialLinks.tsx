import { FaGithub, FaLinkedin, FaXTwitter } from "react-icons/fa6";

type SocialLinksProps = {
  github?: string;
  linkedin?: string;
  x?: string;
  speakerName: string;
};

export default function SocialLinks({ github, linkedin, x, speakerName }: SocialLinksProps) {
  const hasAnySocialLink = github || linkedin || x;

  if (!hasAnySocialLink) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-x-3 text-white">
      {github && (
        <a
          className="transition hover:scale-125 hover:text-yellow-400"
          href={github}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Perfil de GitHub de ${speakerName}`}
        >
          <FaGithub size={22} />
        </a>
      )}
      {github && (linkedin || x) && <div className="h-4 w-px bg-gray-600" aria-hidden="true" />}
      {linkedin && (
        <a
          className="transition hover:scale-125 hover:text-yellow-400"
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Perfil de LinkedIn de ${speakerName}`}
        >
          <FaLinkedin size={22} />
        </a>
      )}
      {linkedin && x && <div className="h-4 w-px bg-gray-600" aria-hidden="true" />}
      {x && (
        <a
          className="transition hover:scale-125 hover:text-yellow-400"
          href={x}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Perfil de X de ${speakerName}`}
        >
          <FaXTwitter size={22} />
        </a>
      )}
    </div>
  );
}
