import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

import { addUtmParams, cn } from "app/lib/utils";

import { CountUp, Reveal, Stagger } from "./motion";

/*
 * The community site's building blocks. A near-black base, soft translucent
 * cards, Poppins titles with OWU's yellow bar underneath, Inter for everything
 * else and mono only where it helps: dates, times, counts, shortcuts.
 */

/** Stagger for .owu-rise / .owu-rise-line, in ms */
export const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export const isExternal = (href: string) => /^(https?:|webcal:|mailto:)/.test(href);

/** External links leave tagged as coming from owu.uy (calendar/mail links pass through) */
export const outbound = (href: string, content?: string) =>
  href.startsWith("http") ? addUtmParams(href, { source: "owu.uy", medium: "web", content }) : href;

export function Container({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)} {...props} />;
}

/* ------------------------------------------------------------------ type */

export const headingClassName = {
  display:
    "font-title text-[clamp(2.5rem,1.6rem+3.6vw,5rem)] leading-[1.02] font-bold tracking-[-0.03em] text-balance text-zinc-50",
  h1: "font-title text-[clamp(2rem,1.5rem+2vw,3.5rem)] leading-[1.06] font-bold tracking-[-0.025em] text-balance text-zinc-50",
  h2: "font-title text-[clamp(1.75rem,1.35rem+1.6vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-balance text-zinc-50",
  h3: "font-title text-lg leading-snug font-semibold tracking-[-0.01em] text-zinc-50",
} as const;

/** A short label above a title: use it once per page, where the title needs context. (`dot` is accepted for older callers and ignored.) */
export function Eyebrow({ children, className }: { children: ReactNode; dot?: boolean; className?: string }) {
  return <p className={cn("text-[13px] font-medium text-zinc-500", className)}>{children}</p>;
}

/** OWU's yellow bar under a title */
export function TitleBar({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block h-1 w-10 rounded-full bg-yellow-400", className)} />;
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] px-1.5 font-terminal text-[10px] font-medium text-zinc-400",
        className
      )}
    >
      {children}
    </kbd>
  );
}

/* ----------------------------------------------------------------- links */

type SmartLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & { href: string; utm?: string };

/** next/link for our pages, a new tab (UTM-tagged) for everything else */
export function SmartLink({ href, utm, children, ...props }: SmartLinkProps) {
  if (isExternal(href)) {
    return (
      <a href={outbound(href, utm)} rel="noopener" target={href.startsWith("http") ? "_blank" : undefined} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-zinc-50 text-zinc-950 hover:bg-yellow-400",
  secondary: "border border-white/[0.09] bg-white/[0.03] text-zinc-100 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white",
  ghost: "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
  accent: "bg-yellow-400 text-zinc-950 hover:bg-yellow-300",
} as const;

const BUTTON_SIZES = {
  sm: "h-9 gap-1.5 px-3.5 text-[13.5px]",
  md: "h-11 gap-2 px-5 text-[15px]",
  lg: "h-12 gap-2 px-6 text-base",
} as const;

export const buttonClassName = (
  variant: keyof typeof BUTTON_VARIANTS = "primary",
  size: keyof typeof BUTTON_SIZES = "md",
  className?: string
) =>
  cn(
    "group/button inline-flex shrink-0 items-center justify-center rounded-xl font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-200 hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className
  );

/** The arrow after a call to action: ↗ when it leaves the site, → when it doesn't */
export function LinkArrow({ external }: { external?: boolean }) {
  const Icon = external ? ArrowUpRight : ArrowRight;

  return (
    <Icon
      aria-hidden
      className={cn(
        "size-4 shrink-0 transition-transform duration-200",
        external
          ? "group-hover/button:translate-x-0.5 group-hover/button:-translate-y-0.5"
          : "group-hover/button:translate-x-0.5"
      )}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  arrow = false,
  className,
  children,
  utm,
  ...props
}: SmartLinkProps & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  arrow?: boolean;
}) {
  return (
    <SmartLink className={buttonClassName(variant, size, className)} href={href} utm={utm} {...props}>
      {children}
      {arrow ? <LinkArrow external={isExternal(href)} /> : null}
    </SmartLink>
  );
}

/** A pill above a hero: a yellow label, then the news */
export function AnnouncementPill({
  href,
  label,
  children,
  utm,
}: {
  href: string;
  label?: ReactNode;
  children: ReactNode;
  utm?: string;
}) {
  return (
    <SmartLink
      className="group/button inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pr-4 pl-4 text-[13px] text-zinc-300 backdrop-blur transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white sm:text-sm"
      href={href}
      utm={utm}
    >
      {label ? <span className="font-semibold text-yellow-400">{label}</span> : null}
      <span className="truncate">{children}</span>
      <ArrowRight aria-hidden className="size-3.5 shrink-0 transition-transform group-hover/button:translate-x-0.5" />
    </SmartLink>
  );
}

/* ------------------------------------------------------------- surfaces */

/** The one card recipe: a translucent slab with a soft top highlight */
export const cardClassName = (interactive = false, className?: string) =>
  cn(
    "relative rounded-2xl border border-white/[0.08] bg-[linear-gradient(rgba(255,255,255,0.045),rgba(255,255,255,0.015))]",
    interactive &&
      "transition-[border-color,background-image,transform] duration-200 hover:-translate-y-px hover:border-white/[0.15] hover:bg-[linear-gradient(rgba(255,255,255,0.07),rgba(255,255,255,0.03))]",
    className
  );

export function Card({ interactive = false, className, ...props }: ComponentPropsWithoutRef<"div"> & { interactive?: boolean }) {
  return <div className={cardClassName(interactive, cn("p-6 sm:p-7", className))} {...props} />;
}

/** A card grid: four columns at most, every item the same height. The items enter one after another. */
export function Cells({ className, children }: { className?: string; children: ReactNode }) {
  return <Stagger className={cn("grid gap-4", className)}>{children}</Stagger>;
}


export function Cell({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <Card className={cn("flex flex-col", className)} {...props} />;
}

const BADGE_TONES = {
  neutral: "bg-white/[0.07] text-zinc-300",
  accent: "bg-yellow-400/15 text-yellow-300",
  // Kept for older callers; every status now reads the same, in words
  green: "bg-white/[0.07] text-zinc-300",
  orange: "bg-white/[0.07] text-zinc-300",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- headers */

/** Page header: kicker, Poppins title with the yellow bar, intro and actions, under a warm light */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  align = "left",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";

  return (
    <header className={cn("relative", className)}>
      <Container className={cn("relative pt-16 pb-12 sm:pt-24 sm:pb-16", centered && "flex flex-col items-center text-center")}>
        {eyebrow ? (
          <div className="owu-rise" style={delay(0)}>
            {typeof eyebrow === "string" ? <Eyebrow>{eyebrow}</Eyebrow> : eyebrow}
          </div>
        ) : null}
        <h1 className={cn(headingClassName.h1, "owu-rise mt-3 max-w-3xl")} style={delay(80)}>
          {title}
        </h1>
        <TitleBar className={cn("owu-rise mt-6", centered && "mx-auto")} />
        {description ? (
          <div
            className={cn("owu-rise mt-6 max-w-2xl text-base leading-relaxed text-pretty text-zinc-400 sm:text-lg", centered && "mx-auto")}
            style={delay(160)}
          >
            {description}
          </div>
        ) : null}
        {actions ? (
          <div className={cn("owu-rise mt-8 flex flex-wrap items-center gap-3", centered && "justify-center")} style={delay(240)}>
            {actions}
          </div>
        ) : null}
        {children}
      </Container>
    </header>
  );
}

/** A page section: title block (kicker, Poppins title, yellow bar, intro, actions) that rises into view, then content */
export function Section({
  id,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  align = "left",
}: {
  id?: string;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Kept so older callers compile; sections are separated by space, not lines */
  bordered?: boolean;
  align?: "left" | "center";
}) {
  const centered = align === "center";

  return (
    <section className={cn("scroll-mt-24 py-16 sm:py-24", className)} id={id}>
      <Container>
        {title || eyebrow ? (
          <Reveal
            className={cn(
              "mb-10 flex flex-col gap-6 sm:mb-14",
              centered ? "items-center text-center" : "md:flex-row md:items-end md:justify-between"
            )}
          >
            <div className={cn("max-w-2xl", centered && "flex flex-col items-center")}>
              {eyebrow ? typeof eyebrow === "string" ? <Eyebrow className="mb-3">{eyebrow}</Eyebrow> : eyebrow : null}
              {title ? <h2 className={headingClassName.h2}>{title}</h2> : null}
              <TitleBar className="mt-5" />
              {description ? (
                <div className="mt-5 text-base leading-relaxed text-pretty text-zinc-400 sm:text-[17px]">{description}</div>
              ) : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
          </Reveal>
        ) : null}
        {children}
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------- pieces */

const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

/** A community's logo on a white plate, or its initials when it has none */
export function CommunityLogo({
  name,
  logo,
  size = "md",
  className,
}: {
  name: string;
  logo: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = { sm: "size-9 rounded-lg", md: "size-12 rounded-xl", lg: "size-16 rounded-2xl" }[size];

  if (!logo) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center border border-white/10 bg-white/[0.06] font-title font-semibold text-zinc-200",
          box,
          size === "sm" ? "text-[11px]" : "text-sm",
          className
        )}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-white p-1.5", box, className)}>
      {/* Logos are small, pre-optimized webp files in /public */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={`Logo de ${name}`} className="max-h-full max-w-full object-contain" loading="lazy" src={logo} />
    </span>
  );
}

/** Native disclosure list: one open at a time when they share a `name` */
export function Faq({ name, items }: { name: string; items: { question: string; answer: ReactNode }[] }) {
  return (
    <div className="divide-y divide-white/[0.08]">
      {items.map(({ question, answer }) => (
        <details key={question} className="group" name={name}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-title text-base font-semibold text-zinc-100 transition-colors hover:text-white sm:text-[17px] [&::-webkit-details-marker]:hidden">
            {question}
            <Plus
              aria-hidden
              className="size-5 shrink-0 text-zinc-500 transition-[transform,color] duration-200 group-open:rotate-45 group-open:text-yellow-400 motion-reduce:transition-none"
            />
          </summary>
          <div className="pr-10 pb-6 text-[15px] leading-relaxed text-zinc-400 [&_a]:text-zinc-200 [&_a]:underline [&_a]:decoration-white/30 [&_a]:underline-offset-4 [&_a:hover]:decoration-yellow-400">
            {answer}
          </div>
        </details>
      ))}
    </div>
  );
}

/** Terminal-style card: a playful way to show steps */
export function Terminal({
  title = "~/owu",
  lines,
  className,
}: {
  title?: string;
  lines: ({ kind: "cmd"; text: ReactNode } | { kind: "out"; text: ReactNode } | { kind: "cursor" })[];
  className?: string;
}) {
  return (
    <div className={cardClassName(false, cn("overflow-hidden", className))}>
      <div className="flex items-center gap-1.5 border-b border-white/[0.07] bg-white/[0.02] px-4 py-3">
        {[0, 1, 2].map((dot) => (
          <span key={dot} aria-hidden className="size-2.5 rounded-full bg-white/15" />
        ))}
        <span className="flex-1 pr-10 text-center font-terminal text-[11px] text-zinc-500">{title}</span>
      </div>
      <div className="space-y-1 px-5 py-5 font-terminal text-[13px] leading-[1.7] sm:px-6">
        {lines.map((line, index) =>
          line.kind === "cursor" ? (
            <div key={index} className="flex items-center">
              <span className="mr-2 text-yellow-400">$</span>
              <span aria-hidden className="owu-caret inline-block h-3.5 w-[7px] bg-zinc-50" />
            </div>
          ) : line.kind === "cmd" ? (
            <div key={index} className="text-zinc-100">
              <span aria-hidden className="mr-2 text-yellow-400 select-none">
                $
              </span>
              {line.text}
            </div>
          ) : (
            <div key={index} className="text-zinc-500">
              {line.text}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** "+5.000" → { prefix: "+", number: 5000, suffix: "" } */
const splitFigure = (value: string | number) => {
  if (typeof value === "number") return { prefix: "", number: value, suffix: "" };
  const digits = value.replace(/[^\d]/g, "");

  return {
    prefix: value.match(/^[^\d]*/)?.[0] ?? "",
    number: digits ? Number(digits) : 0,
    suffix: value.match(/[^\d]*$/)?.[0] ?? "",
  };
};

/** Big yellow figures that count up when they scroll into view */
export function StatStrip({
  stats,
  className,
}: {
  stats: { value: string | number; label: string }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4", className)}>
      {stats.map(({ value, label }) => {
        const figure = splitFigure(value);

        return (
          <div key={label} className="flex flex-col-reverse gap-2">
            <dt className="text-sm leading-snug text-zinc-400">{label}</dt>
            <dd className="font-title text-4xl font-extrabold tracking-[-0.02em] text-yellow-400 tabular-nums sm:text-5xl">
              <CountUp prefix={figure.prefix} suffix={figure.suffix} value={figure.number} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** "updated on" line: every block fed by hand says how fresh it is */
export function Freshness({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-zinc-500", className)}>{children}</p>;
}
