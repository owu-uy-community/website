import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-white/[0.05] text-zinc-400">
        <Icon aria-hidden className="size-5" />
      </span>
      <h3 className="mt-2 font-title text-lg font-semibold text-white">{title}</h3>
      <p className="max-w-md text-[15px] leading-relaxed text-zinc-400">{description}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
