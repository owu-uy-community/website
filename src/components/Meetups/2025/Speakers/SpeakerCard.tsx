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
    <article className="relative flex h-full w-full flex-col md:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.5rem)]">
      <div className="relative h-[400px] w-full overflow-hidden">
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
      <h4 className="relative bottom-16 flex flex-col text-center text-3xl font-black uppercase italic leading-[.8em] text-yellow-400 [text-shadow:0_0_20px_black] md:text-5xl md:leading-[.8em]">
        <span>{firstname}</span>
        <span>{lastname}</span>
      </h4>

      {/* Footer with speaker details */}
      <footer className="relative bottom-12 flex flex-1 flex-col">
        <div className="text-center">
          {jobTitle && <p className="mb-4 text-sm font-semibold text-yellow-400">{jobTitle}</p>}
          <SocialLinks github={github} linkedin={linkedin} x={x} speakerName={fullName} />
        </div>
      </footer>
    </article>
  );
}
