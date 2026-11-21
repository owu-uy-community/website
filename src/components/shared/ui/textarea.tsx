import * as React from "react";

import { cn } from "app/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full min-w-0 rounded-md border border-input bg-background px-2.5 py-2 text-base text-foreground shadow-edge transition-colors placeholder:text-faint hover:border-white/15 focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-live/60 sm:text-ui pointer-coarse:text-base",
        className
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

export { Textarea };
