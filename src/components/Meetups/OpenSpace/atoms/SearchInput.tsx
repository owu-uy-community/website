"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "app/lib/utils";
import { Input } from "components/shared/ui/input";
import { Kbd } from "components/shared/ui/kbd";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** The key that focuses it, shown while it's empty. */
  shortcut?: string;
  className?: string;
}

/** Filters the board by title or speaker. Escape clears it and gives the board the keyboard back. */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder = "Buscar charla…", shortcut, className }, ref) => (
    <div className={cn("relative w-full min-w-0", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={ref}
        aria-keyshortcuts={shortcut}
        aria-label="Buscar charla"
        autoCapitalize="none"
        autoCorrect="off"
        className={cn("w-full pl-8", shortcut && "pr-8")}
        // The phone keyboard's key reads "Buscar" and puts the keyboard away, uncovering the results.
        enterKeyHint="search"
        placeholder={placeholder}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key !== "Escape") return;
          onChange("");
          e.currentTarget.blur();
        }}
      />
      {shortcut && !value ? (
        <Kbd aria-hidden className="absolute top-1/2 right-2 -translate-y-1/2 max-md:hidden">
          {shortcut}
        </Kbd>
      ) : null}
    </div>
  )
);
SearchInput.displayName = "SearchInput";
