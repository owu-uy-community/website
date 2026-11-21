import { cn } from "app/lib/utils";
import { initials } from "components/community/ui";
import { avatarSources } from "lib/timeline/image";

// Without a Meetup photo: their initials on two colors, always the same two for the same name
const GRADIENTS = [
  ["#fde047", "#f97316"],
  ["#c4b5fd", "#6366f1"],
  ["#6ee7b7", "#0ea5e9"],
  ["#f9a8d4", "#a855f7"],
  ["#7dd3fc", "#4f46e5"],
  ["#fdba74", "#e11d48"],
  ["#bef264", "#14b8a6"],
  ["#facc15", "#84cc16"],
] as const;

const hash = (value: string) => {
  let sum = 7;
  for (let i = 0; i < value.length; i++) sum = (sum * 31 + value.charCodeAt(i)) >>> 0;
  return sum;
};

/** An organizer's face: their Meetup photo, as published, or their initials. Decorative: their name goes next to it */
export default function Avatar({
  name,
  photo,
  size,
  eager,
  className,
}: {
  name: string;
  photo?: string;
  /** CSS px */
  size: number;
  /** In the first screenful: loads right away */
  eager?: boolean;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (photo) {
    const { src, srcSet } = avatarSources(photo, size);
    return (
      <img
        alt=""
        className={cn("shrink-0 rounded-full bg-zinc-800 object-cover", className)}
        decoding="async"
        height={size}
        loading={eager ? "eager" : "lazy"}
        src={src}
        srcSet={srcSet}
        style={box}
        width={size}
      />
    );
  }
  const [from, to] = GRADIENTS[hash(name) % GRADIENTS.length];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-title font-semibold text-zinc-950 select-none",
        className
      )}
      style={{ ...box, fontSize: Math.round(size * 0.38), backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initials(name)}
    </span>
  );
}
