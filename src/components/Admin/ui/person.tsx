"use client";

import { useState } from "react";

import { cn } from "app/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";

const TINTS = ["#f5bb03", "#6ea2fa", "#34d399", "#ffb900", "#f0abfc", "#67e8f9", "#fca5a5", "#bef264"];

function tintFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** A person's photo, or their initials on a tint that is stable for their name. */
export function PersonAvatar({
  name,
  image,
  size = 24,
  className,
  title,
}: {
  name: string;
  image?: string | null;
  size?: number;
  className?: string;
  title?: string;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) };

  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts (Slack, Gravatar, /public)
      <img
        alt={title ?? name}
        className={cn("shrink-0 rounded-full bg-raised object-cover", className)}
        src={image}
        style={style}
        title={title ?? name}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span
      aria-label={title ?? name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-black/80",
        className
      )}
      role="img"
      style={{ ...style, backgroundColor: tintFor(name) }}
      title={title ?? name}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Overlapping avatars with a "+N" chip once there are more than `max`. Names live in the avatars'
 * titles, which a touchscreen never shows: with `details` (the list's heading) a tap or a click
 * opens the whole list by name. Leave it off inside something that is itself a link or a button.
 */
export function AvatarStack({
  people,
  max = 3,
  size = 22,
  className,
  details,
}: {
  people: { id: string; name: string; image?: string | null; title?: string }[];
  max?: number;
  size?: number;
  className?: string;
  details?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const avatars = (
    <>
      {shown.map((person, index) => (
        <PersonAvatar
          key={person.id}
          className={cn("ring-2 ring-background", index > 0 && "-ml-1.5")}
          image={person.image}
          name={person.name}
          size={size}
          title={person.title}
        />
      ))}
      {rest > 0 ? (
        <span
          className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-raised font-terminal text-[10px] text-subtle ring-2 ring-background"
          style={{ width: size, height: size }}
          title={people
            .slice(max)
            .map((person) => person.title ?? person.name)
            .join(", ")}
        >
          +{rest}
        </span>
      ) : null}
    </>
  );
  if (!details || people.length === 0) return <span className={cn("flex items-center", className)}>{avatars}</span>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`${details}: ${people.length}`}
          className={cn(
            "touch-target flex items-center rounded-full focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
            className
          )}
          type="button"
        >
          {avatars}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <p className="px-1.5 pt-1 pb-1.5 font-terminal text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">
          {details}
        </p>
        <ul className="max-h-64 scrollbar-thin overflow-y-auto">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-ui">
              <PersonAvatar image={person.image} name={person.name} size={20} />
              <span className="min-w-0 truncate text-foreground">{person.title ?? person.name}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
