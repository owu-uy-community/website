import Link from "next/link";

const baseChipClassName = "h-7 rounded-full border px-3 font-terminal text-xs transition-colors inline-flex items-center";
const inactiveChipClassName = `${baseChipClassName} border-line text-zinc-400 hover:border-line-strong hover:text-zinc-100`;
const activeChipClassName = `${baseChipClassName} border-yellow-400/40 bg-yellow-400/[0.08] text-yellow-300`;

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
            <button key={label} aria-pressed={isActive} className={className} type="button" onClick={() => onSelect(tag)}>
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
