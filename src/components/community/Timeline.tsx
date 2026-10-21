import type { ReactNode } from "react";

import { SmartLink } from "./ui";

export type Milestone = { when: string; title: string; body?: ReactNode; href?: string; now?: boolean };

/** Vertical timeline: mono dates on a hairline, the current milestone lit in yellow */
export default function Timeline({ items }: { items: Milestone[] }) {
  return (
    <ol className="relative border-l border-line pl-6">
      {items.map(({ when, title, body, href, now }) => (
        <li key={`${when}-${title}`} className="relative pb-8 last:pb-0">
          <span
            aria-hidden
            className={
              now
                ? "absolute top-1 -left-[29px] size-2.5 rounded-full bg-yellow-400 shadow-[0_0_0_4px_rgba(250,204,21,0.15)]"
                : "absolute top-1 -left-[28px] size-2 rounded-full border border-line-strong bg-ink"
            }
          />
          <p className="font-terminal text-[11px] tracking-[0.12em] text-zinc-500 uppercase">{when}</p>
          <p className="mt-1 text-[15px] font-medium text-zinc-100">
            {href ? (
              <SmartLink
                className="underline decoration-white/15 underline-offset-4 hover:decoration-yellow-400"
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
