import * as React from "react";

import { cn } from "app/lib/utils";

const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => (
  <kbd
    ref={ref}
    className={cn(
      "pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-terminal text-[10px] font-medium text-muted-foreground",
      className
    )}
    {...props}
  />
));
Kbd.displayName = "Kbd";

export { Kbd };
