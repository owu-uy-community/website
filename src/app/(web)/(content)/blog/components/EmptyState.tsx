import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-16 text-center">
      <Icon aria-hidden className="size-7 text-zinc-600" />
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-zinc-400">{description}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
