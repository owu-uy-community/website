import * as React from "react";

import { cn } from "app/lib/utils";

const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => (
  <kbd
    ref={ref}
    className={cn(
      "pointer-events-none inline-flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 rounded-[4px] border border-b-2 border-input bg-white/[0.04] px-1 font-terminal text-[10.5px] leading-none font-medium text-muted-foreground select-none",
      className
    )}
    {...props}
  />
));
Kbd.displayName = "Kbd";

export { Kbd };
