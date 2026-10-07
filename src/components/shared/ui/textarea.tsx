import * as React from "react";

import { cn } from "app/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
        className
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

export { Textarea };
