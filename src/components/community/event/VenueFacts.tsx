import Image from "next/image";
import { Bus, Car, Check, IdCard, UtensilsCrossed } from "lucide-react";

import { cn } from "app/lib/utils";
import { headingClassName } from "components/community/ui";
import { FACT_FLAGS } from "lib/organizar/venue-facts";
import type { PublicEvent } from "lib/orpc/events/schemas";

/**
 * "Cómo llegar y qué hay": the host space's access facts on an event page, and its logo. Where to
 * park or which bus only when the space shows its address to everyone (the server leaves them out).
 */
export function VenueFacts({ place }: { place: PublicEvent["place"] }) {
  const facts = place?.facts;
  if (!place || (!facts && !place.logoUrl)) return null;
  const lines = facts
    ? [
        ...FACT_FLAGS.filter((flag) => facts[flag.key]).map((flag) => ({ icon: Check, text: flag.label })),
        ...(facts.transit ? [{ icon: Bus, text: `Cómo llegar: ${facts.transit}` }] : []),
        ...(facts.parking ? [{ icon: Car, text: `Estacionamiento: ${facts.parking}` }] : []),
        ...(facts.idRequired
          ? [{ icon: IdCard, text: "Llevá tu cédula: el edificio pide la lista de quienes vienen." }]
          : []),
        ...(facts.foodRules ? [{ icon: UtensilsCrossed, text: `Comida: ${facts.foodRules}` }] : []),
      ]
    : [];

  return (
    <section aria-labelledby="como-llegar" className="mt-10">
      <h2 className={cn(headingClassName.h3, "text-xl")} id="como-llegar">
        Cómo llegar y qué hay
      </h2>
      {place.logoUrl ? (
        <p className="mt-4 flex items-center gap-3 text-[15px] text-zinc-300">
          <Image
            alt=""
            className="size-10 rounded-lg bg-white object-contain p-1"
            height={40}
            src={place.logoUrl}
            unoptimized
            width={40}
          />
          Nos recibe {place.name}
        </p>
      ) : null}
      {lines.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2.5">
          {lines.map((line) => (
            <li key={line.text} className="flex items-start gap-3 text-[15px] text-zinc-300">
              <line.icon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-zinc-500" />
              {line.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
