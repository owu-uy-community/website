import { Search } from "lucide-react";

interface SearchFieldProps {
  value?: string;
  onChange?: (value: string) => void;
}

export default function SearchField({ value, onChange }: SearchFieldProps) {
  return (
    <div className="relative w-full shrink-0 md:max-w-xs">
      <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
      <input
        aria-label="Buscar posts"
        className="h-10 w-full rounded-lg border border-line bg-white/[0.02] pr-3 pl-9 text-sm text-zinc-100 outline-hidden transition-colors placeholder:text-zinc-600 focus:border-yellow-400/50 focus:bg-white/[0.04]"
        placeholder="Buscar por título, tema o autor"
        type="search"
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
    </div>
  );
}
