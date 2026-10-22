import * as React from "react";

import { cn } from "app/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2.5 py-1 text-base text-foreground shadow-edge transition-colors file:border-0 file:bg-transparent file:text-ui file:font-medium file:text-foreground placeholder:text-faint hover:border-white/15 focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-live/60 sm:h-8 sm:text-ui pointer-coarse:text-base pointer-coarse:sm:h-10",
        className
      )}
      type={type}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input };
