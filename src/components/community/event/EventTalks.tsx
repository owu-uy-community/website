import { Mic } from "lucide-react";

import { cn } from "app/lib/utils";
import { cardClassName, headingClassName } from "components/community/ui";
import type { PublicEvent } from "lib/orpc/events/schemas";

/** The talks and who gives them, when the organizers listed them. */
export function EventTalks({ talks }: { talks: PublicEvent["talks"] }) {
  if (talks.length === 0) return null;

  return (
    <section aria-labelledby="charlas" className="mt-10">
      <h2 className={cn(headingClassName.h3, "text-xl")} id="charlas">
        Charlas
      </h2>
      <ol className="mt-4 flex flex-col gap-3">
        {talks.map((talk, index) => (
          <li key={`${index}-${talk.title}`} className={cardClassName(false, "flex items-center gap-3 p-4")}>
            <Mic aria-hidden className="size-5 shrink-0 text-yellow-400" />
            <span className="min-w-0">
              <span className="block font-medium text-zinc-100">{talk.title}</span>
              {talk.speaker ? <span className="block text-[14px] text-zinc-400">{talk.speaker}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
