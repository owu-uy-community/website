import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { cn } from "app/lib/utils";

/** The public site's form pieces for talks: inputs, a group with its legend, and toggle chips. */

export const inputClassName =
  "h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-zinc-400 hover:border-white/25 focus-visible:border-yellow-400/60 focus-visible:ring-2 focus-visible:ring-yellow-400/20 aria-invalid:border-red-400/60";

export const textareaClassName = cn(inputClassName, "h-auto min-h-28 py-3 leading-relaxed");

export function Group({ legend, hint, children }: { legend: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-zinc-200">{legend}</legend>
      {hint ? <p className="-mt-2 text-sm leading-relaxed text-zinc-400">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="text-sm text-red-300" id={id}>
      {message}
    </p>
  ) : null;
}

/** A checkbox or radio that looks like a chip; the native input keeps keyboard and screen readers working. */
export function Chip({
  type = "checkbox",
  name,
  checked,
  disabled,
  onChange,
  children,
}: {
  type?: "checkbox" | "radio";
  name?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className={cn("group relative cursor-pointer", disabled && !checked && "cursor-not-allowed opacity-50")}>
      <input
        checked={checked}
        className="peer sr-only"
        disabled={disabled && !checked}
        name={name}
        type={type}
        onChange={onChange}
      />
      <span className="flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-3.5 py-2 text-sm text-zinc-300 transition-colors group-hover:bg-white/[0.06] peer-checked:border-yellow-400 peer-checked:bg-yellow-400/10 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow-400">
        <span
          aria-hidden
          className={cn(
            "flex size-4 shrink-0 items-center justify-center border",
            type === "radio" ? "rounded-full" : "rounded",
            checked ? "border-yellow-400 bg-yellow-400 text-zinc-950" : "border-zinc-500"
          )}
        >
          {checked ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        {children}
      </span>
    </label>
  );
}

/** Toggle a value in a list. */
export const toggle = <T,>(list: readonly T[], value: T) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
