type SectionHeadingProps = {
  title: string;
  subtitle?: string;
};

export default function SectionHeading({ title, subtitle }: SectionHeadingProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h2 className="font-title text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
        {title}
      </h2>
      <span aria-hidden className="h-1 w-12 rounded-full bg-yellow-400" />
      {subtitle ? <p className="max-w-xl text-balance text-sm text-zinc-400 sm:text-base">{subtitle}</p> : null}
    </div>
  );
}
