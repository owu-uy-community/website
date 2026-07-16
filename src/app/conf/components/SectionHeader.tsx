import classNames from "classnames";

import Reveal from "./Reveal";

type SectionHeaderProps = {
  eyebrow: string;
  title: React.ReactNode;
  eyebrowClassName?: string;
  titleClassName?: string;
  /** Title type scale; replaceable to avoid conflicting Tailwind classes on fine-tuned cases */
  titleSizeClassName?: string;
};

export default function SectionHeader({
  eyebrow,
  title,
  eyebrowClassName = "text-[#FBF5E7]",
  titleClassName = "text-[#FBF5E7]",
  titleSizeClassName = "text-3xl sm:text-4xl min-[1440px]:text-5xl",
}: SectionHeaderProps) {
  return (
    <div>
      <Reveal y={18} duration={0.55}>
        <p className={classNames("font-display text-sm font-semibold uppercase leading-none tracking-[0.18em]", eyebrowClassName)}>
          {eyebrow}
        </p>
      </Reveal>
      <Reveal delay={0.1} y={26}>
        <h2
          className={classNames(
            "mt-4 text-balance font-display font-extrabold uppercase leading-none tracking-[-0.02em]",
            titleSizeClassName,
            titleClassName
          )}
        >
          {title}
        </h2>
      </Reveal>
    </div>
  );
}
