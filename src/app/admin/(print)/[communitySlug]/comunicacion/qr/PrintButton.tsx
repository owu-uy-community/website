"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      className="ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800 pointer-coarse:h-11"
      type="button"
      onClick={() => window.print()}
    >
      <Printer aria-hidden className="size-4" />
      Imprimir
    </button>
  );
}
