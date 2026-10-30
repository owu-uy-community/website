type Mark = { name: string; slug?: string; logoUrl?: string | null };

/** "Rust Uruguay" → "RU", "Python" → "PY": the same two letters wherever a community has no logo. */
export const communityInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);

  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? "").slice(0, 2)).toUpperCase();
};

/** The community's mark: its logo, OWU's for OWU, or its initials. */
export function CommunityMark({ size = 32, ...props }: (Mark | { community: Mark }) & { size?: number }) {
  const { name, slug, logoUrl } = "community" in props ? props.community : props;
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
          aria-hidden
          className="font-display font-extrabold text-primary"
          style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
        >
          {communityInitials(name)}
        </span>
      )}
    </span>
  );
}
