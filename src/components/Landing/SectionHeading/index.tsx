type SectionHeadingProps = {
  title: string;
  subtitle?: string;
  /** Heading level — pages should use "h1" for their main heading (SEO), sections keep "h2" */
  as?: "h1" | "h2";
};

export default function SectionHeading({ title, subtitle, as: Heading = "h2" }: SectionHeadingProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Heading className="font-title text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
        {title}
      </Heading>
      <span aria-hidden className="h-1 w-12 rounded-full bg-yellow-400" />
      {subtitle ? <p className="max-w-xl text-balance text-sm text-zinc-400 sm:text-base">{subtitle}</p> : null}
    </div>
  );
}
