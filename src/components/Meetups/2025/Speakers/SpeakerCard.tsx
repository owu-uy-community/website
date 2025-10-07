import Image from "next/image";
import SocialLinks from "./SocialLinks";

type SpeakerCardProps = {
  firstname: string;
  lastname: string;
  picture?: { url: string };
  jobTitle?: string;
  github?: string;
  linkedin?: string;
  x?: string;
};

export default function SpeakerCard({ firstname, lastname, picture, jobTitle, github, linkedin, x }: SpeakerCardProps) {
  const fullName = `${firstname} ${lastname}`;
  const imageSrc = picture?.url || "/placeholder.webp";

  return (
    <article className="relative flex min-w-0 flex-1 flex-col">
      <div className="relative h-[200px] w-full overflow-hidden">
        <Image
          className="h-full w-full cursor-pointer object-contain object-center grayscale transition-all duration-500 [mask-image:linear-gradient(to_bottom,_black_80%,transparent_100%)] hover:grayscale-0"
          alt={`Fotografía de ${fullName}`}
          src={imageSrc}
          width={400}
          height={350}
          priority={false}
        />
      </div>

      {/* Speaker Name overlapping image */}
      <h4 className="relative bottom-10 flex flex-col text-center text-2xl font-black uppercase italic leading-[.8em] text-yellow-400 [text-shadow:0_0_20px_black] md:text-3xl md:leading-[.8em]">
        <span>{firstname}</span>
        <span>{lastname}</span>
      </h4>

      {/* Footer with speaker details */}
      <footer className="relative bottom-8 flex flex-1 flex-col">
        <div className="text-center">
          {jobTitle && <p className="mb-2 text-xs font-semibold text-yellow-400 md:text-sm">{jobTitle}</p>}
          <SocialLinks github={github} linkedin={linkedin} x={x} speakerName={fullName} />
        </div>
      </footer>
    </article>
  );
}
