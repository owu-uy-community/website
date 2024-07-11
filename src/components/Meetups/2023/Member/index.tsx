type MemberProps = {
  name: string;
  role: string;
  image: string;
  linkedin: string;
};

export default function Member({ name, role, image, linkedin }: MemberProps) {
  return (
    <a
      className="flex h-full min-h-[270px] w-full min-w-[160px] max-w-[185px] flex-1 flex-col items-center justify-center"
      href={`https://linkedin.com/in/${linkedin}`}
      rel="external noopener nofollow"
      target="_blank"
    >
      <div className="group relative flex w-full flex-1 cursor-pointer flex-col items-center justify-center rounded-md bg-white/10 p-[1px] transition-all">
        <div className="flex w-full flex-1 flex-col justify-between gap-3 rounded bg-[#000214]/50 px-6 py-6 transition group-hover:bg-[#000214]/10">
          <span>
            <figure className="flex items-center justify-center">
              <img
                alt={`Speaker: ${name}`}
                className="h-28 w-28 rounded-full bg-white object-cover transition group-hover:scale-110"
                loading="lazy"
                src={image}
              />
            </figure>
            <h3 className="mt-3 text-center font-bold text-white">{name}</h3>
            <p className="text-center text-sm text-sky-200">{role}</p>
          </span>
        </div>
      </div>
    </a>
  );
}
