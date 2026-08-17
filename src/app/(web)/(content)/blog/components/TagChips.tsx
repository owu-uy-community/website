import Link from "next/link";

const baseChipClassName = "rounded-full border px-3 py-1 font-terminal text-xs transition-colors";
const inactiveChipClassName = `${baseChipClassName} border-white/10 text-zinc-400 hover:border-yellow-400/40 hover:text-yellow-400`;
const activeChipClassName = `${baseChipClassName} border-yellow-400 bg-yellow-400/10 text-yellow-400`;

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
    <div className="flex w-full flex-wrap justify-center gap-2">
      {items.map(({ isActive, label, tag }) => {
        const className = isActive ? activeChipClassName : inactiveChipClassName;

        if (onSelect) {
          return (
            <button key={label} className={className} type="button" onClick={() => onSelect(tag)}>
              {label}
            </button>
          );
        }

        return (
          <Link key={label} className={className} href={tag ? `/blog?tag=${encodeURIComponent(tag)}` : "/blog"}>
            {label}
          </Link>
        );
      })}
    </div>
  );
}
