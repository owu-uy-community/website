"use client";

import { Search } from "lucide-react";

import { Input } from "components/shared/ui/input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "Buscar charla..." }: SearchInputProps) {
  return (
    <div className="relative w-full min-w-0 xl:w-auto">
      <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      <Input
        placeholder={placeholder}
        aria-label="Buscar charla"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full pl-9 md:h-9 xl:w-64"
      />
    </div>
  );
}
