import { Github, Linkedin, Twitter } from "lucide-react";

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
    <div className="flex justify-center gap-x-4 text-white">
      {github && (
        <a
          className="transition hover:scale-150 hover:text-yellow-400"
          href={github}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Perfil de GitHub de ${speakerName}`}
        >
          <Github className="h-6 w-6" />
        </a>
      )}
      {linkedin && (
        <a
          className="transition hover:scale-150 hover:text-yellow-400"
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Perfil de LinkedIn de ${speakerName}`}
        >
          <Linkedin className="h-6 w-6" />
        </a>
      )}
      {x && (
        <a
          className="transition hover:scale-150 hover:text-yellow-400"
          href={x}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Perfil de X de ${speakerName}`}
        >
          <Twitter className="h-6 w-6" />
        </a>
      )}
    </div>
  );
}
