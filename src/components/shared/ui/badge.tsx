import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "app/lib/utils";

/** Small status labels: a tinted surface, a readable tint and a hairline in the same hue. */
const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-2xs font-medium whitespace-nowrap transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary-surface text-primary",
        secondary: "border-input bg-white/[0.04] text-subtle",
        outline: "border-input text-subtle",
        destructive: "border-live/30 bg-live-surface text-live-foreground",
        success: "border-success/25 bg-success-surface text-success-foreground",
        warning: "border-warning/25 bg-warning-surface text-warning-foreground",
        info: "border-info/40 bg-info-surface text-info-foreground",
        /** Solid yellow, for counts that want attention (unread, selected). */
        solid: "border-transparent bg-primary text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
