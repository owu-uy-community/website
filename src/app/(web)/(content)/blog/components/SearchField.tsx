import { Search } from "lucide-react";

interface SearchFieldProps {
  value?: string;
  onChange?: (value: string) => void;
}

export default function SearchField({ value, onChange }: SearchFieldProps) {
  return (
    <div className="relative w-full max-w-md">
      <Search aria-hidden className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
      <input
        aria-label="Buscar posts"
        className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 font-terminal text-sm text-white outline-hidden transition-colors placeholder:text-zinc-500 focus:border-yellow-400/60 focus:bg-white/[0.07]"
        placeholder="Buscar posts..."
        type="search"
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
    </div>
  );
}
