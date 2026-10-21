import type { ReactNode } from "react";

import { SmartLink } from "./ui";

export type Milestone = { when: string; title: string; body?: ReactNode; href?: string; now?: boolean };

/** Vertical timeline: small uppercase dates on a hairline, the current milestone lit in yellow */
export default function Timeline({ items }: { items: Milestone[] }) {
  return (
    <ol className="relative border-l border-white/10 pl-7">
      {items.map(({ when, title, body, href, now }) => (
        <li key={`${when}-${title}`} className="relative pb-8 last:pb-0">
          <span
            aria-hidden
            className={
              now
                ? "absolute top-1.5 -left-[33px] size-2.5 rounded-full bg-yellow-400 shadow-[0_0_0_5px_rgba(250,204,21,0.15)]"
                : "absolute top-1.5 -left-[32px] size-2 rounded-full bg-zinc-600"
            }
          />
          <p className="text-xs font-semibold tracking-[0.14em] text-zinc-500 uppercase">{when}</p>
          <p className="mt-1 font-title text-base font-semibold text-white">
            {href ? (
              <SmartLink
                className="underline decoration-white/15 underline-offset-4 transition-colors hover:decoration-yellow-400"
                href={href}
                utm="historia"
              >
                {title}
              </SmartLink>
            ) : (
              title
            )}
          </p>
          {body ? <div className="mt-1 text-sm leading-relaxed text-zinc-400">{body}</div> : null}
        </li>
      ))}
    </ol>
  );
}
