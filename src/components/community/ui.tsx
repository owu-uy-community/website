import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

import { addUtmParams, cn } from "app/lib/utils";

/*
 * The community site's building blocks. Dark ink surfaces, white hairlines and a
 * single accent (yellow-400) used for signals: eyebrow dots, focus, the primary
 * button's hover. Labels, dates and counts are set in mono.
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

export function Eyebrow({ children, dot = false, className }: { children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 font-terminal text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase",
        className
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-yellow-400" /> : null}
      {children}
    </p>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-white/[0.04] px-1.5 font-terminal text-[10px] font-medium text-zinc-400",
        className
      )}
    >
      {children}
    </kbd>
  );
}

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
  secondary: "border border-line-strong bg-white/[0.02] text-zinc-100 hover:border-white/25 hover:bg-white/[0.06]",
  ghost: "text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-50",
  accent: "bg-yellow-400 text-zinc-950 hover:bg-yellow-300",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-5 text-[15px]",
} as const;

export const buttonClassName = (
  variant: keyof typeof BUTTON_VARIANTS = "primary",
  size: keyof typeof BUTTON_SIZES = "md",
  className?: string
) =>
  cn(
    "group/button inline-flex shrink-0 items-center justify-center rounded-md font-medium tracking-[-0.01em] whitespace-nowrap transition-[background-color,border-color,color,transform] duration-200 hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50",
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
        external ? "group-hover/button:translate-x-0.5 group-hover/button:-translate-y-0.5" : "group-hover/button:translate-x-0.5"
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

/** Small mono pill with a yellow dot: announcements above a hero */
export function AnnouncementPill({ href, children, utm }: { href: string; children: ReactNode; utm?: string }) {
  return (
    <SmartLink
      className="group/button inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-ink/80 py-1 pr-3 pl-2.5 font-terminal text-[11px] text-zinc-400 backdrop-blur transition-colors hover:border-line-strong hover:text-zinc-100 sm:text-xs"
      href={href}
      utm={utm}
    >
      <span aria-hidden className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-yellow-400 opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-1.5 rounded-full bg-yellow-400" />
      </span>
      <span className="truncate">{children}</span>
      <span aria-hidden className="transition-transform group-hover/button:translate-x-0.5">
        →
      </span>
    </SmartLink>
  );
}

/** "+" registration mark for the corners of framed blocks */
export function Cross({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute z-10", className)}>
      <span className="absolute h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/20" />
      <span className="absolute h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-white/20" />
    </span>
  );
}

/** Framed page header: guide rails at the content edges, corner marks, a warm light from above */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("relative overflow-hidden border-b border-line", className)}>
      <div aria-hidden className="owu-furnace pointer-events-none absolute inset-0" />
      <div aria-hidden className="owu-grid-fade pointer-events-none absolute inset-0 opacity-60" />
      <Container className="relative">
        <div className="relative border-x border-line px-5 pt-16 pb-12 sm:px-10 sm:pt-24 sm:pb-16">
          <Cross className="top-0 left-0" />
          <Cross className="top-0 right-0" />
          <Cross className="bottom-0 left-0" />
          <Cross className="right-0 bottom-0" />
          {eyebrow ? (
            <div className="owu-rise" style={delay(0)}>
              {typeof eyebrow === "string" ? <Eyebrow dot>{eyebrow}</Eyebrow> : eyebrow}
            </div>
          ) : null}
          <h1
            className="owu-rise mt-5 max-w-3xl text-4xl leading-[1.02] font-semibold tracking-[-0.035em] text-balance text-zinc-50 sm:text-5xl md:text-6xl"
            style={delay(80)}
          >
            {title}
          </h1>
          {description ? (
            <div
              className="owu-rise mt-5 max-w-2xl text-base leading-relaxed text-pretty text-zinc-400 sm:text-lg"
              style={delay(160)}
            >
              {description}
            </div>
          ) : null}
          {actions ? (
            <div className="owu-rise mt-8 flex flex-wrap items-center gap-3" style={delay(240)}>
              {actions}
            </div>
          ) : null}
          {children}
        </div>
      </Container>
    </header>
  );
}

/** A page section: hairline on top, a header (eyebrow, title, intro, actions), then content */
export function Section({
  id,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  bordered = true,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bordered?: boolean;
}) {
  return (
    <section className={cn("scroll-mt-20 py-16 sm:py-24", bordered && "border-t border-line", className)} id={id}>
      <Container>
        {title || eyebrow ? (
          <div className="mb-10 flex flex-col gap-6 sm:mb-12 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              {eyebrow ? typeof eyebrow === "string" ? <Eyebrow dot>{eyebrow}</Eyebrow> : eyebrow : null}
              {title ? (
                <h2 className="mt-4 text-3xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance text-zinc-50 sm:text-4xl">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <div className="mt-4 text-base leading-relaxed text-pretty text-zinc-400 sm:text-[17px]">{description}</div>
              ) : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}
        {children}
      </Container>
    </section>
  );
}

/** Bordered cell grid: the hairlines between cells come from a 1px gap over the line color */
export function Cells({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("grid gap-px overflow-hidden rounded-xl border border-line bg-line", className)} {...props} />;
}

export function Cell({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("relative bg-ink p-6 sm:p-8", className)} {...props} />;
}

const BADGE_TONES = {
  neutral: "border-line-strong text-zinc-400",
  accent: "border-yellow-400/30 bg-yellow-400/[0.08] text-yellow-300",
  green: "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300",
  orange: "border-orange-400/30 bg-orange-400/[0.07] text-orange-300",
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
        "inline-flex h-5 items-center gap-1 rounded-full border px-2 font-terminal text-[10px] font-medium tracking-[0.06em] whitespace-nowrap uppercase",
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

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
  const box = { sm: "size-9 rounded-md", md: "size-12 rounded-lg", lg: "size-16 rounded-xl" }[size];

  if (!logo) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center border border-line-strong bg-ink-card font-terminal font-semibold text-yellow-400",
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
    <div className="divide-y divide-line border-y border-line">
      {items.map(({ question, answer }) => (
        <details key={question} className="group" name={name}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-medium text-zinc-100 transition-colors hover:text-zinc-50 sm:text-lg [&::-webkit-details-marker]:hidden">
            {question}
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-zinc-400 transition-transform duration-200 group-open:rotate-45 group-open:text-yellow-400 motion-reduce:transition-none"
            >
              +
            </span>
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
    <div className={cn("overflow-hidden rounded-xl border border-line bg-gradient-to-b from-white/[0.02] to-transparent", className)}>
      <div className="flex items-center gap-1.5 border-b border-line bg-white/[0.02] px-3.5 py-2.5">
        {[0, 1, 2].map((dot) => (
          <span key={dot} aria-hidden className="size-2.5 rounded-full bg-[#2a2a30]" />
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

/** Bordered strip of figures; tabular numbers so they line up */
export function StatStrip({ stats, className }: { stats: { value: string; label: string }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4", className)}>
      {stats.map(({ value, label }) => (
        <div key={label} className="bg-ink p-5 sm:p-6">
          <dt className="font-terminal text-[11px] tracking-[0.08em] text-zinc-500 uppercase">{label}</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-zinc-50 tabular-nums sm:text-4xl">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Mono "updated on" line: every block fed by hand says how fresh it is */
export function Freshness({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("font-terminal text-[11px] text-zinc-600", className)}>{children}</p>;
}
