import classNames from "classnames";

type PillLinkProps = {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "outline";
  external?: boolean;
  className?: string;
  /** Replaceable size (avoids conflicting Tailwind classes), e.g. the compact mobile navbar */
  sizeClassName?: string;
};

export default function PillLink({
  href,
  children,
  variant = "solid",
  external,
  className,
  sizeClassName = "h-12 px-6 text-base",
}: PillLinkProps) {
  return (
    <a
      className={classNames(
        "inline-flex items-center justify-center gap-2 rounded-full text-center font-display font-bold uppercase leading-none transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]",
        sizeClassName,
        variant === "solid"
          ? "bg-[#F5BB03] text-black hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_rgba(245,187,3,0.65)]"
          : "border-2 border-[#FBF5E7]/40 text-[#FBF5E7] hover:border-[#F5BB03] hover:text-[#F5BB03]",
        className
      )}
      href={href}
      rel={external ? "noopener" : undefined}
      target={external ? "_blank" : undefined}
    >
      {children}
    </a>
  );
}
