import Link from "next/link";

const baseChipClassName =
  "inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors";
const inactiveChipClassName = `${baseChipClassName} border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white`;
const activeChipClassName = `${baseChipClassName} border-yellow-400 bg-yellow-400 text-zinc-950`;

interface TagChipsProps {
  tags: string[];
  active?: string;
  /** With a handler chips are buttons (client filtering); without it they are plain links */
  onSelect?: (tag: string | null) => void;
}

export default function TagChips({ tags, active = "", onSelect }: TagChipsProps) {
  if (tags.length === 0) return null;

  const items: { tag: string | null; label: string; isActive: boolean }[] = [
    { tag: null, label: "Todos", isActive: active === "" },
    ...tags.map((tag) => ({ tag, label: `#${tag}`, isActive: active === tag })),
  ];

  return (
    <div className="flex w-full flex-wrap gap-2">
      {items.map(({ isActive, label, tag }) => {
        const className = isActive ? activeChipClassName : inactiveChipClassName;

        if (onSelect) {
          return (
            <button
              key={label}
              aria-pressed={isActive}
              className={className}
              type="button"
              onClick={() => onSelect(tag)}
            >
              {label}
            </button>
          );
        }

        return (
          <Link
            key={label}
            aria-current={isActive ? "page" : undefined}
            className={className}
            href={tag ? `/blog?tag=${encodeURIComponent(tag)}` : "/blog"}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
