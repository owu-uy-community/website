import Link from "next/link";
import { addUtmParams } from "app/lib/utils";

type MemberProps = {
  name: string;
  role: string;
  linkedin?: string;
  twitter?: string;
  github?: string;
  image: string;
};

export default function Member({ name, role, image, linkedin, twitter, github }: MemberProps) {
  const cardContent = (
    <div className="relative flex w-full min-w-[280px] max-w-[285px] flex-1 flex-col items-center justify-center rounded-md bg-white/10 p-[1px] transition-all hover:bg-white/20">
      <div className="flex w-full flex-1 flex-col justify-between gap-2 rounded-md bg-[#000214]/50 px-6 py-5 transition">
        <span>
          <figure className="flex items-center justify-center">
            <img
              alt={name}
              className="h-60 w-full rounded-md bg-white object-cover transition"
              loading="lazy"
              src={image}
            />
          </figure>
        </span>
        <div className="flex flex-col gap-2">
          <span className="flex flex-col gap-1.5">
            <h3 className="mt-3 font-bold text-white">{name}</h3>
            <p className="text-sm text-sky-200">{role}</p>
          </span>
        </div>
      </div>
    </div>
  );

  const socialLink = linkedin || twitter || github;

  if (socialLink) {
    const platform = linkedin ? "LinkedIn" : twitter ? "Twitter" : "GitHub";
    return (
      <Link
        href={addUtmParams(socialLink)}
        target="_blank"
        className="cursor-pointer"
        aria-label={`Perfil de ${platform} de ${name}`}
      >
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
