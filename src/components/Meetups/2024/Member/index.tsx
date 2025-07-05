import Link from "next/link";
import { FaGithub, FaLinkedin } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

import { addUtmParams } from "app/lib/utils";

type MemberProps = {
  name: string;
  role: string;
  github?: string;
  linkedin?: string;
  twitter?: string;
  image: string;
};

export default function Member({ name, role, image, github, linkedin, twitter }: MemberProps) {
  return (
    <div className="relative flex min-w-[250px] max-w-[300px] flex-1 flex-col items-center justify-center rounded-md bg-white/10 p-[1px] transition-all">
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
        <div className="flex flex-col gap-4">
          <span className="flex flex-col gap-1.5">
            <h3 className="mt-3 font-bold text-white">{name}</h3>
            <p className="text-sm text-sky-200">{role}</p>
          </span>
          <span className="flex flex-row gap-2">
            {github ? (
              <Link href={addUtmParams(github)} target="_blank">
                <FaGithub className="cursor-pointer text-[24px] text-white hover:scale-105" />
              </Link>
            ) : null}
            {linkedin ? (
              <Link href={addUtmParams(linkedin)} target="_blank">
                <FaLinkedin className="cursor-pointer text-[24px] text-white hover:scale-105" />
              </Link>
            ) : null}
            {twitter ? (
              <Link href={addUtmParams(twitter)} target="_blank">
                <FaXTwitter className="cursor-pointer text-[24px] text-white hover:scale-105" />
              </Link>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
