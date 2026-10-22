/** The community's mark: its logo, OWU's for OWU, or its initials. */
export function CommunityMark({
  name,
  slug,
  logoUrl,
  size = 32,
}: {
  name: string;
  slug: string;
  logoUrl?: string | null;
  size?: number;
}) {
  const src = logoUrl ?? (slug === "owu" ? "/images/logos/owu.webp" : null);

  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-black ring-1 ring-input"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- community logos live on any host
        <img alt="" className="size-full object-contain p-[3px]" src={src} />
      ) : (
        <span
          className="font-display font-extrabold text-primary"
          style={{ fontSize: Math.max(11, Math.round(size * 0.34)) }}
        >
          {name.slice(0, 3).toUpperCase()}
        </span>
      )}
    </span>
  );
}
