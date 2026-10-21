"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "app/lib/utils";

/** A read-only value with a copy button that confirms for two seconds */
export default function CopyField({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, permissions): the value stays selectable
    }
  };

  return (
    <div className={cn("flex min-w-0 items-center rounded-xl border border-white/10 bg-black/30 font-terminal text-[13px]", className)}>
      <span aria-hidden className="pl-3.5 text-zinc-600 select-none">
        $
      </span>
      <input
        readOnly
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-zinc-200 outline-none"
        value={value}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        aria-label={copied ? "Copiado" : `Copiar ${label}`}
        className="m-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white"
        type="button"
        onClick={copy}
      >
        {copied ? <Check className="size-3.5 text-yellow-400" /> : <Copy className="size-3.5" />}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copiado al portapapeles" : ""}
      </span>
    </div>
  );
}
