import { Search, X } from "lucide-react";

interface SearchFieldProps {
  value?: string;
  onChange?: (value: string) => void;
}

export default function SearchField({ value, onChange }: SearchFieldProps) {
  return (
    <div className="relative w-full shrink-0 md:max-w-sm">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-500"
      />
      <input
        aria-label="Buscar posts"
        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-10 pl-11 text-[15px] text-white transition-colors outline-none placeholder:text-zinc-500 focus:border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/20 [&::-webkit-search-cancel-button]:hidden"
        placeholder="Buscar por título, tema o autor"
        type="search"
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
      {value && onChange ? (
        <button
          aria-label="Limpiar búsqueda"
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-white"
          type="button"
          onClick={() => onChange("")}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
