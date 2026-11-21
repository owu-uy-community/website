import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "app/lib/utils";

/**
 * One control scale: 32px by default, 28 and 24 for dense rows, 44 for phones. On touch screens
 * every size gets an invisible 44px hit area instead of growing, so dense toolbars stay dense.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-ui font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:duration-0 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-1/2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** The one primary action of a view. */
        default:
          "bg-primary text-primary-foreground shadow-edge-primary hover:bg-primary/90 active:bg-primary/85 [&_kbd]:border-black/15 [&_kbd]:bg-black/10 [&_kbd]:text-primary-foreground/70",
        brand:
          "bg-white text-black shadow-lg shadow-black/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary hover:shadow-primary/20 active:translate-y-0",
        destructive:
          "border border-live/25 bg-live-surface text-live-foreground hover:border-live/40 hover:bg-live/15 active:bg-live/25 [&_svg]:text-live-foreground",
        /** The neutral button: a raised surface with a hairline. */
        outline:
          "border border-input bg-raised text-foreground shadow-edge hover:bg-accent hover:text-accent-foreground active:bg-input [&_svg]:text-subtle",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent active:bg-input",
        ghost: "text-subtle hover:bg-accent hover:text-accent-foreground active:bg-input active:text-foreground",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline active:opacity-70",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 rounded-sm px-2.5 text-meta [&_svg]:size-3.5",
        xs: "h-6 rounded-sm px-2 text-2xs [&_svg]:size-3.5",
        lg: "h-10 px-4",
        /** Phones: a full 44px target. */
        touch: "h-11 rounded-lg px-4 text-[15px] [&_svg]:size-5",
        icon: "size-8",
        "icon-sm": "size-7 rounded-sm [&_svg]:size-3.5",
        "icon-xs": "size-6 rounded-sm [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
