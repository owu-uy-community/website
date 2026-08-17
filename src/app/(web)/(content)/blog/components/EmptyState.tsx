import type { LucideIcon } from "lucide-react";

export const emptyStateActionClassName =
  "rounded-full border border-yellow-400/60 px-4 py-1.5 text-sm font-medium text-yellow-400 transition-colors hover:bg-yellow-400/10";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
      <Icon aria-hidden className="size-8 text-zinc-600" />
      <h3 className="font-title text-lg font-bold text-white">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-zinc-400">{description}</p>
      {children}
    </div>
  );
}
