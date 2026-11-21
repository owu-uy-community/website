import { Link2, PlayCircle, Presentation } from "lucide-react";

import { cn } from "app/lib/utils";
import { cardClassName, headingClassName } from "components/community/ui";
import type { PublicEvent } from "lib/orpc/events/schemas";

const KIND = {
  grabacion: { icon: PlayCircle, label: "Grabación" },
  slides: { icon: Presentation, label: "Slides" },
  link: { icon: Link2, label: "Link" },
} as const;

/** What stays after the event (recordings, slides, links): shown once it's over, if there's any. */
export function EventMaterials({ event }: { event: Pick<PublicEvent, "materials" | "endDate" | "status"> }) {
  if (event.materials.length === 0 || event.status === "cancelled" || Date.parse(event.endDate) > Date.now()) {
    return null;
  }

  return (
    <section aria-labelledby="materiales" className="mt-10">
      <h2 className={cn(headingClassName.h3, "text-xl")} id="materiales">
        Materiales
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {event.materials.map((material) => {
          const { icon: Icon, label } = KIND[material.kind];

          return (
            <li key={material.url}>
              <a
                className={cardClassName(true, "flex items-center gap-3 p-4")}
                href={material.url}
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                <Icon aria-hidden className="size-5 shrink-0 text-yellow-400" />
                <span className="min-w-0">
                  <span className="block text-[13px] text-zinc-500">{label}</span>
                  <span className="block truncate font-medium text-zinc-100">{material.title}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
