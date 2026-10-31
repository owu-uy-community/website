import Link from "next/link";
import { Fragment } from "react";

import { cn } from "app/lib/utils";
import type { TimelinePersonChip, TimelineSpeaker } from "lib/timeline/types";

import Avatar from "./Avatar";

// Faces shown before a "+N"
const STACK = 8;

export const personHref = (slug: string) => `/timeline/personas/${slug}`;

const NAME_LINK =
  "underline decoration-white/20 underline-offset-4 transition-colors hover:text-white hover:decoration-yellow-400";

/** A talk's speakers, each linked to their profile when they have one ("A, B") */
export function SpeakerNames({
  speakers,
  except,
  onNavigate,
}: {
  speakers: TimelineSpeaker[];
  /** The profile being read: named, not linked to itself */
  except?: string;
  onNavigate?: () => void;
}) {
  return speakers.map((speaker, i) => (
    <Fragment key={`${speaker.name}-${i}`}>
      {i ? ", " : null}
      {speaker.person && speaker.person !== except ? (
        <Link className={NAME_LINK} href={personHref(speaker.person)} onClick={onNavigate}>
          {speaker.name}
        </Link>
      ) : (
        speaker.name
      )}
    </Fragment>
  ));
}

/**
 * Who organized an event: their faces in a row (32px tall, always one row), then their names.
 * Each face and each name links to the person's profile; the names are what a keyboard or a
 * screen reader gets, the faces are decoration.
 */
export default function Organizers({
  people,
  onNavigate,
  className,
}: {
  people: TimelinePersonChip[];
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div aria-hidden className="flex h-8 items-center">
        {people.slice(0, STACK).map((person, i) => (
          <Link
            key={person.slug}
            className={cn(
              "relative rounded-full ring-2 ring-zinc-950 transition-transform hover:z-10 hover:-translate-y-0.5",
              i > 0 && "-ml-2"
            )}
            href={personHref(person.slug)}
            onClick={onNavigate}
            tabIndex={-1}
            title={person.name}
          >
            <Avatar name={person.name} photo={person.photo} size={32} />
          </Link>
        ))}
        {people.length > STACK ? (
          <span className="-ml-2 flex size-8 items-center justify-center rounded-full bg-zinc-800 text-[11px] text-zinc-300 ring-2 ring-zinc-950">
            +{people.length - STACK}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[14px] text-zinc-300">
        {people.map((person, i) => (
          <Fragment key={person.slug}>
            {i ? ", " : null}
            <Link className={NAME_LINK} href={personHref(person.slug)} onClick={onNavigate}>
              {person.name}
            </Link>
          </Fragment>
        ))}
      </p>
    </div>
  );
}
